import type { Comment } from '@/lib/content';

/** Read-only comments recovered from the original site. The text is shown exactly as archived. */
export function ArchivedComments({ comments }: { comments: Comment[] }) {
  if (comments.length === 0) return null;
  return (
    <section aria-labelledby="comments" className="mt-12">
      <h2 id="comments" className="display border-b-2 border-ink pb-3 text-[30px]">
        Comments from the original site
      </h2>
      <p className="mt-3 text-[14px] text-muted">Archived from the original site. Commenting is closed.</p>
      <ol className="mt-4">
        {comments.map((c, i) => (
          <li key={i} className="border-b border-rule-soft py-5 [overflow-wrap:anywhere]">
            <p className="label text-muted">
              {c.author || 'Reader'}
              {c.date && <> · {c.date}</>}
            </p>
            {/* The export kept Markdown hard breaks ("\" + newline): show them as line breaks. */}
            <p className="mt-2 whitespace-pre-line text-[16px] leading-relaxed">{c.text.replace(/\\\n/g, '\n')}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
