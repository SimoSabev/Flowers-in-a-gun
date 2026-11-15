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
  { label: 'Архив: коментари от стария сайт (не пипай)', itemLabel: (p) => p.fields.author.value },
);

const hideComments = fields.checkbox({
  label: 'Архив: скрий старите коментари',
  description: 'Коментарите остават във файла, просто не се показват.',
  defaultValue: false,
});

const content = fields.markdoc({
  label: 'Текст',
  options: { image: { directory: 'public/images/posts', publicPath: '/images/posts/' } },
  components: {
    embed: block({
      label: 'Видео / музика (YouTube, SoundCloud, Spotify...)',
      schema: {
        provider: fields.select({
          label: 'Източник',
          description: 'Остави "Автоматично". Сайтът сам разпознава YouTube, Vimeo, SoundCloud, Spotify и Mixcloud.',
          defaultValue: 'auto',
          options: [
            { label: 'Автоматично', value: 'auto' },
            ...['youtube', 'vimeo', 'soundcloud', 'bandcamp', 'spotify', 'mixcloud', 'reverbnation',
                'facebook', 'instagram', 'audio', 'video', 'other'].map((v) => ({ label: v, value: v })),
          ],
        }),
        src: fields.text({
          label: 'Линк',
          description: 'Постави линка, както е в браузъра, напр. https://www.youtube.com/watch?v=…',
        }),
        // Optional, for posts whose player is gone (Instagram): the text readers saw on the old site.
        caption: fields.text({ label: 'Надпис (по желание)', multiline: true }),
        credit: fields.text({ label: 'Автор на видеото (по желание)', description: 'напр. "Видео: …"' }),
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
        title: fields.slug({
          name: { label: 'Заглавие' },
          slug: { label: 'Адрес в сайта', description: 'Попълва се сам от заглавието. Не го сменяй след публикуване.' },
        }),
        date: fields.date({ label: 'Дата', defaultValue: { kind: 'today' } }),
        author: fields.relationship({
          label: 'Автор',
          description: 'Ако го оставиш празно, авторът е Mart Kawaii.',
          collection: 'authors',
        }),
        categories: fields.array(fields.relationship({ label: 'Категория', collection: 'categories' }), {
          label: 'Категории', description: 'Първата се показва на картичката.', itemLabel: (p) => p.value ?? '',
        }),
        tags: fields.array(fields.relationship({ label: 'Таг', collection: 'tags' }), {
          label: 'Тагове (по желание)', itemLabel: (p) => p.value ?? '',
        }),
        // Optional upload for new posts; wins over `featuredImage` (the recovered WordPress path).
        cover: fields.image({
          label: 'Основна снимка',
          description: 'Качи снимка. Ако няма, сайтът взима първата снимка от текста.',
          directory: 'public/images/posts',
          publicPath: '/images/posts/',
        }),
        // Optional display fields added for the site design; empty = derived automatically.
        venue: fields.text({ label: 'Място (по желание)', description: 'Клуб или зала, показва се на картичката.' }),
        excerpt: fields.text({
          label: 'Кратко описание (по желание)',
          description: 'Ако е празно, се взимат първите ~30 думи от текста.',
          multiline: true,
        }),
        content,
        // --- archive metadata (kept for redirects / provenance) ---
        featuredImage: fields.text({ label: 'Архив: стара основна снимка (не пипай)' }),
        wpId: fields.integer({ label: 'Архив: WordPress номер (не пипай)' }),
        originalUrl: fields.text({ label: 'Архив: стар адрес (не пипай)' }),
        hideComments,
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
        hideComments,
        comments,
      },
    }),
    videos: collection({
      label: 'Videos',
      slugField: 'title',
      path: 'content/videos/*',
      columns: ['title', 'section'],
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        outlet: fields.text({ label: 'Made for (outlet)', defaultValue: 'ZoomIn.TV' }),
        section: fields.select({
          label: 'Section',
          defaultValue: 'new-york',
          options: [
            { label: 'Fashion Week', value: 'fashion' },
            { label: 'Film & Tribeca', value: 'film' },
            { label: 'New York', value: 'new-york' },
          ],
        }),
        driveId: fields.text({
          label: 'Google Drive file ID',
          description: 'From the share link: drive.google.com/file/d/<ID>/view. The file must be shared as "Anyone with the link".',
        }),
        youtubeId: fields.text({ label: 'YouTube video ID (optional)', description: 'Used instead of Drive when set.' }),
        description: fields.text({ label: 'Description (optional)', multiline: true }),
        hidden: fields.checkbox({ label: 'Hide on the site', defaultValue: false }),
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
