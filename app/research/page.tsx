import type { Metadata } from 'next';
import ResearchIndex from './research-index';

export const metadata: Metadata = {
  title: 'Research packets — ATAP Solar',
  description: 'Every research packet across all categories, with its facts, sources, gaps and recorded conflicts.',
};

export default function Page() {
  return <ResearchIndex />;
}
