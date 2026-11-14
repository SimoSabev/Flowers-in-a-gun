'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDate } from '@/lib/format';

type Item = { t: string; p: string; k: string; d?: string };

const norm = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

let cache: Promise<Item[]> | null = null;
const loadIndex = () =>
  (cache ??= fetch('/search-index.json')
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => {
      cache = null;
      return [];
    }));

const MAX_RESULTS = 20;

/** Title search over a static index. Opens with the button, "/" or Ctrl/Cmd+K; Esc closes. */
export function SearchDialog({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Item[] | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    loadIndex().then(setItems);
    input.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const results = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!items || words.length === 0) return [];
    return items.filter((it) => {
      const hay = norm(`${it.t} ${it.k}`);
      return words.every((w) => hay.includes(w));
    });
  }, [q, items]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className={`flex h-11 w-11 shrink-0 items-center justify-center border-2 border-ink bg-surface text-ink hover:bg-lime ${className}`}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <circle cx="7.5" cy="7.5" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M12 12l5 5" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          className="fixed inset-0 z-[60] overflow-y-auto bg-ink/80 px-4 pt-[10vh] pb-10"
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="mx-auto max-w-[720px] border-2 border-ink bg-surface">
            <div className="flex items-center gap-3 border-b-2 border-ink p-3">
              <input
                ref={input}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search stories, bands, venues, videos…"
                aria-label="Search titles"
                className="min-w-0 flex-1 bg-transparent px-2 py-2 text-[18px] outline-none"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="label shrink-0 px-2 py-2 text-[12px] text-muted hover:text-ink"
              >
                Close
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto" aria-live="polite">
              {q.trim() === '' ? (
                <p className="p-5 text-[15px] text-muted">Type a band, a venue or a word from a title.</p>
              ) : items === null ? (
                <p className="p-5 text-[15px] text-muted">Loading…</p>
              ) : results.length === 0 ? (
                <p className="p-5 text-[15px] text-muted">Nothing found for “{q}”.</p>
              ) : (
                <ul>
                  {results.slice(0, MAX_RESULTS).map((r) => (
                    <li key={r.p} className="border-b border-rule-soft last:border-b-0">
                      <Link href={r.p} onClick={() => setOpen(false)} className="block px-5 py-3 hover:bg-lime">
                        <span className="label block text-[11px] text-green-text">
                          {r.k}
                          {r.d && ` · ${formatDate(r.d)}`}
                        </span>
                        <span className="mt-1 block text-[16px] font-semibold leading-snug">{r.t}</span>
                      </Link>
                    </li>
                  ))}
                  {results.length > MAX_RESULTS && (
                    <li className="px-5 py-3 text-[13px] text-muted">
                      {results.length - MAX_RESULTS} more: add a word to narrow it down.
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
