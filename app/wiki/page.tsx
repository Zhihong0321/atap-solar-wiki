import type { Metadata } from 'next';
import WikiIndex from './wiki-index';

export const metadata: Metadata = {
  title: 'ATAP Solar research wiki',
  description: 'Reviewed programme pages and the full research corpus: providers, sources, media, dated records and glossary.',
};

export default function Page() {
  return <WikiIndex />;
}
