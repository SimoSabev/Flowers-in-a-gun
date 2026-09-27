import { config, collection, fields } from '@keystatic/core';
import { block } from '@keystatic/core/content-components';

// Local editing in dev; GitHub mode in production (Keystatic GitHub App, see README.md).
// NEXT_PUBLIC_ because this file also runs in the browser (the /keystatic editor).
// NEXT_PUBLIC_KEYSTATIC_STORAGE=github forces GitHub mode in dev, needed once to create the GitHub App.
const storage =
  process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_KEYSTATIC_STORAGE !== 'github'
    ? ({ kind: 'local' } as const)
    : ({
        kind: 'github',
        repo: (process.env.NEXT_PUBLIC_KEYSTATIC_GITHUB_REPO ?? 'SimoSabev/Flowers-in-a-gun') as `${string}/${string}`,
      } as const);

// Read-only archive of comments from the original site (posts and pages).
const comments = fields.array(
  fields.object({
    author: fields.text({ label: 'Author' }),
    date: fields.text({ label: 'Date', description: 'As shown on the old site, e.g. 2014-03-31T15:44' }),
    depth: fields.integer({ label: 'Reply depth', description: '1 = comment, 2 = reply, 3 = reply to a reply', defaultValue: 1 }),
    text: fields.text({ label: 'Text', multiline: true }),
  }),
  { label: 'Archived comments', itemLabel: (p) => p.fields.author.value },
);

const content = fields.markdoc({
  label: 'Content',
  options: { image: { directory: 'public/images/posts', publicPath: '/images/posts/' } },
  components: {
    embed: block({
      label: 'Embed (YouTube, SoundCloud, Bandcamp...)',
      schema: {
        provider: fields.select({
          label: 'Provider',
          defaultValue: 'youtube',
          options: ['youtube', 'vimeo', 'soundcloud', 'bandcamp', 'spotify', 'mixcloud', 'reverbnation',
                    'facebook', 'instagram', 'audio', 'video', 'other'].map((v) => ({ label: v, value: v })),
        }),
        src: fields.text({ label: 'Embed URL' }),
        // Optional, for posts whose player is gone (Instagram): the text readers saw on the old site.
        caption: fields.text({ label: 'Caption (optional)', multiline: true }),
        credit: fields.text({ label: 'Credit line (optional)', description: 'e.g. "A post shared by … on Oct 7, 2017"' }),
      },
    }),
  },
});

export default config({
  storage,
  ui: { brand: { name: 'Flowers in a Gun' } },
  collections: {
    posts: collection({
      label: 'Posts',
      slugField: 'title',
      path: 'content/posts/*',
      format: { contentField: 'content' },
      entryLayout: 'content',
      columns: ['title', 'date'],
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        date: fields.date({ label: 'Date', defaultValue: { kind: 'today' } }),
        author: fields.relationship({ label: 'Author', collection: 'authors' }),
        categories: fields.array(fields.relationship({ label: 'Category', collection: 'categories' }), {
          label: 'Categories', itemLabel: (p) => p.value ?? '',
        }),
        tags: fields.array(fields.relationship({ label: 'Tag', collection: 'tags' }), {
          label: 'Tags', itemLabel: (p) => p.value ?? '',
        }),
        featuredImage: fields.text({ label: 'Featured image path' }),
        // Optional display fields added for the site design; empty = derived automatically.
        venue: fields.text({ label: 'Venue (shown on cards, optional)' }),
        excerpt: fields.text({
          label: 'Excerpt (optional)',
          description: 'Leave empty to use the first ~30 words of the post.',
          multiline: true,
        }),
        content,
        // --- archive metadata (kept for redirects / provenance) ---
        wpId: fields.integer({ label: 'Original WordPress ID' }),
        originalUrl: fields.text({ label: 'Original URL' }),
        comments,
      },
    }),
    pages: collection({
      label: 'Pages',
      slugField: 'title',
      path: 'content/pages/*',
      format: { contentField: 'content' },
      entryLayout: 'content',
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        featuredImage: fields.text({ label: 'Featured image path' }),
        content,
        wpId: fields.integer({ label: 'Original WordPress ID' }),
        originalUrl: fields.text({ label: 'Original URL' }),
        comments,
      },
    }),
    authors: collection({
      label: 'Authors', slugField: 'name', path: 'content/authors/*',
      schema: { name: fields.slug({ name: { label: 'Name' } }) },
    }),
    categories: collection({
      label: 'Categories', slugField: 'name', path: 'content/categories/*',
      schema: { name: fields.slug({ name: { label: 'Name' } }) },
    }),
    tags: collection({
      label: 'Tags', slugField: 'name', path: 'content/tags/*',
      schema: { name: fields.slug({ name: { label: 'Name' } }) },
    }),
  },
});
