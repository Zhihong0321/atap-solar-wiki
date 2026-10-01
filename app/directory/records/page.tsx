import type { Metadata } from 'next';
import RecordsDirectory from './records-directory';

export const metadata: Metadata = {
  title: 'Dated records',
  description: 'Every dated fact in the corpus, newest first, with its raw lineage.',
};

export default function Page() {
  return <RecordsDirectory />;
}
