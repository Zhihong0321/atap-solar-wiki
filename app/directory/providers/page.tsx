import type { Metadata } from 'next';
import ProvidersDirectory from './providers-directory';

export const metadata: Metadata = {
  title: 'SEDA registered providers',
  description: '436 registered PV service providers and 368 registered PV investors, with contacts and coverage.',
};

export default function Page() {
  return <ProvidersDirectory />;
}
