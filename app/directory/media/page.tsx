import type { Metadata } from 'next';
import MediaDirectory from './media-directory';

export const metadata: Metadata = {
  title: 'Media library',
  description: '2,883 distinct captured files, deduplicated by content hash.',
};

export default function Page() {
  return <MediaDirectory />;
}
