import type { Metadata } from 'next';
import GlossaryDirectory from './glossary-directory';

export const metadata: Metadata = {
  title: 'Glossary',
  description: 'Defined terms from the corpus, each with the source that defines it.',
};

export default function Page() {
  return <GlossaryDirectory />;
}
