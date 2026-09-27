import { config, collection, fields } from '@keystatic/core';
import { block } from '@keystatic/core/content-components';

// Local editing in dev; GitHub mode in production (Keystatic GitHub App, see keystatic.com/docs/github-mode)
const storage =
  process.env.NODE_ENV === 'development'
    ? ({ kind: 'local' } as const)
    : ({ kind: 'github', repo: 'OWNER/flowersinagun' } as const);

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
        content,
        // --- archive metadata (kept for redirects / provenance) ---
        wpId: fields.integer({ label: 'Original WordPress ID' }),
        originalUrl: fields.text({ label: 'Original URL' }),
        comments: fields.array(
          fields.object({
            author: fields.text({ label: 'Author' }),
            date: fields.text({ label: 'Date' }),
            text: fields.text({ label: 'Text', multiline: true }),
          }),
          { label: 'Archived comments', itemLabel: (p) => p.fields.author.value },
        ),
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
