import Link from 'next/link';
import type { Post } from '@/lib/content';

export function ListItem({ post }: { post: Post }) {
  return (
    <li className="border-b border-rule-soft first:border-t">
      <Link
        href={post.path}
        className="block py-4 text-[17px] font-semibold leading-snug text-ink decoration-2 underline-offset-4 hover:underline"
      >
        {post.title}
      </Link>
    </li>
  );
}
