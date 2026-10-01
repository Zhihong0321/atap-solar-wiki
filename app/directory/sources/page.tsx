import type { Metadata } from 'next';
import SourcesDirectory from './sources-directory';

export const metadata: Metadata = {
  title: 'Source register',
  description: 'All 647 sources the research cited, with archive capture status and fact counts.',
};

export default function Page() {
  return <SourcesDirectory />;
}
