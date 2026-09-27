import type { Metadata } from 'next';
import KeystaticApp from './keystatic';

export const metadata: Metadata = { title: 'Editor', robots: { index: false, follow: false } };

export default function Layout() {
  return <KeystaticApp />;
}
