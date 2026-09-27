import { Fragment } from 'react';
import type { Comment } from '@/lib/content';
import { formatDateTime } from '@/lib/format';

const URL_RE = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'’”])/g;

/** Plain text with bare URLs made clickable (as WordPress did). Never renders HTML. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} rel="nofollow ugc noopener noreferrer" className="text-green-text underline underline-offset-2 hover:bg-lime hover:text-ink">
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

const INDENT = ['', 'ml-5 sm:ml-10 border-l-2 border-rule-soft pl-4 sm:pl-5', 'ml-10 sm:ml-20 border-l-2 border-rule-soft pl-4 sm:pl-5'];

/** Read-only comments recovered from the original site, threaded as they were. Text shown exactly as archived. */
export function ArchivedComments({ comments }: { comments: Comment[] }) {
  if (comments.length === 0) return null;
  return (
    <section aria-labelledby="comments" className="mt-12">
      <h2 id="comments" className="display border-b-2 border-ink pb-3 text-[30px]">
        Comments from the original site
      </h2>
      <p className="mt-3 text-[14px] text-muted">
        {comments.length} {comments.length === 1 ? 'comment' : 'comments'}, archived from the original site. Commenting is closed.
      </p>
      <ol className="mt-4">
        {comments.map((c, i) => (
          <li key={i} className={`border-b border-rule-soft py-5 [overflow-wrap:anywhere] ${INDENT[c.depth - 1] ?? ''}`}>
            <p className="text-[15px]">
              <span className="font-bold">{c.author || 'Reader'}</span>
              {c.depth > 1 && <span className="label ml-2 text-[11px] text-muted">Reply</span>}
            </p>
            {c.date && (
              <p className="mt-0.5 text-[13px] text-muted">
                <time dateTime={c.date}>{formatDateTime(c.date)}</time>
              </p>
            )}
            <p className="mt-2 whitespace-pre-line text-[16px] leading-relaxed">
              <Linkified text={c.text} />
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
