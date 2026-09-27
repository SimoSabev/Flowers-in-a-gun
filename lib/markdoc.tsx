import 'server-only';
import React from 'react';
import Markdoc, { Tag, type Config, type Node, type RenderableTreeNode } from '@markdoc/markdoc';
import { Embed } from '@/components/Embed';
import { ExternalImage } from '@/components/ExternalImage';
import { isLocalPath, localImage, type LocalImage } from './images';

/**
 * Markdoc -> React for recovered WordPress content.
 * - `{% embed %}` becomes <Embed> (iframe for live providers, plain link otherwise).
 * - Local images are checked on disk: missing ones are dropped (caption kept), present ones get
 *   width/height so their space is reserved. External images hide themselves if they fail to load.
 * - No raw HTML is ever rendered: Markdoc does not pass HTML through.
 */

const OWN_HOSTS = new Set(['flowersinagun.com', 'www.flowersinagun.com']);
const PULL_QUOTE_MAX_WORDS = 40;
/** Body column is at most 680px wide. */
const BODY_SIZES = '(min-width: 720px) 680px, 100vw';

/**
 * WordPress turned scheme-less links ("www.band.com", "a@b.com") into paths under the post,
 * e.g. "/the-divers/www.facebook.com/thediversmusic". They were broken on the old site too;
 * point them where the author meant. Only unambiguous host names and e-mail addresses qualify.
 */
const SCHEMELESS_HOST = /^\/[^/]+\/((?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|co\.uk|dk|fm)(?:\/[^\s]*)?)$/i;
const SCHEMELESS_EMAIL = /^\/[^/]+\/([^/\s@]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i;

function repairHref(href: string): string {
  const email = href.match(SCHEMELESS_EMAIL);
  if (email) return `mailto:${email[1]}`;
  const host = href.match(SCHEMELESS_HOST);
  return host ? `https://${host[1]}` : href;
}

type Vars = { images: Record<string, LocalImage | null> };

function isEmpty(child: RenderableTreeNode): boolean {
  if (child === null || child === undefined) return true;
  if (typeof child === 'string') return child.trim() === '';
  if (Tag.isTag(child)) return child.name === 'br';
  return false;
}

function plainText(node: Node): string {
  let out = '';
  for (const n of node.walk()) if (n.type === 'text') out += String(n.attributes.content ?? '');
  return out;
}

const config: Config = {
  tags: {
    embed: {
      render: 'Embed',
      selfClosing: true,
      attributes: { provider: { type: String }, src: { type: String } },
    },
  },
  nodes: {
    // Render the body's children directly: the page already provides the <article> element.
    document: {
      transform(node, cfg) {
        return node.transformChildren(cfg);
      },
    },
    image: {
      attributes: { src: { type: String }, alt: { type: String }, title: { type: String } },
      transform(node, cfg) {
        const { src, alt = '', title } = node.attributes as { src: string; alt?: string; title?: string };
        const caption = title?.trim() ? new Tag('figcaption', {}, [title]) : null;
        let img: Tag | null;
        if (isLocalPath(src)) {
          const found = (cfg.variables as Vars).images[src];
          img = found
            ? new Tag('img', {
                src: found.src,
                ...(found.srcSet ? { srcSet: found.srcSet, sizes: BODY_SIZES } : {}),
                alt,
                width: found.width,
                height: found.height,
                loading: 'lazy',
                decoding: 'async',
              })
            : null;
        } else {
          img = new Tag('ExternalImage', { src, alt });
        }
        if (!caption) return img;
        return new Tag('figure', {}, img ? [img, caption] : [caption]);
      },
    },
    link: {
      attributes: { href: { type: String }, title: { type: String } },
      transform(node, cfg) {
        let href = String(node.attributes.href ?? '');
        const attrs: Record<string, string> = {};
        try {
          const url = new URL(href);
          if (OWN_HOSTS.has(url.hostname)) href = url.pathname + url.search + url.hash;
          else if (url.protocol === 'http:' || url.protocol === 'https:') attrs.rel = 'noopener noreferrer';
          else if (url.protocol !== 'mailto:') href = '#';
        } catch {
          href = repairHref(href);
          if (href.startsWith('https://')) attrs.rel = 'noopener noreferrer';
        }
        if (node.attributes.title) attrs.title = String(node.attributes.title);
        return new Tag('a', { href, ...attrs }, node.transformChildren(cfg));
      },
    },
    paragraph: {
      transform(node, cfg) {
        const children = node.transformChildren(cfg);
        // Paragraphs that only held (now dropped) images would leave empty gaps.
        if (children.every(isEmpty)) return null;
        return new Tag('p', {}, children);
      },
    },
    heading: {
      attributes: { level: { type: Number } },
      transform(node, cfg) {
        // The page title is the only h1; body headings start at h2 to keep the outline in order.
        const level = Math.min(6, Math.max(2, Number(node.attributes.level) || 2));
        return new Tag(`h${level}`, {}, node.transformChildren(cfg));
      },
    },
    blockquote: {
      transform(node, cfg) {
        const words = plainText(node).trim().split(/\s+/).filter(Boolean).length;
        const className = words <= PULL_QUOTE_MAX_WORDS ? 'pullquote' : 'quote';
        return new Tag('blockquote', { className }, node.transformChildren(cfg));
      },
    },
  },
};

async function resolveImages(doc: Node): Promise<Vars['images']> {
  const srcs = new Set<string>();
  for (const n of doc.walk()) {
    if (n.type === 'image' && typeof n.attributes.src === 'string' && isLocalPath(n.attributes.src)) {
      srcs.add(n.attributes.src);
    }
  }
  const entries = await Promise.all([...srcs].map(async (s) => [s, await localImage(s)] as const));
  return Object.fromEntries(entries);
}

export async function renderMarkdoc(doc: Node): Promise<React.ReactNode> {
  const images = await resolveImages(doc);
  const tree = Markdoc.transform(doc, { ...config, variables: { images } });
  return Markdoc.renderers.react(tree, React, { components: { Embed, ExternalImage } });
}
