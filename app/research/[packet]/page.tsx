import type { Metadata } from 'next';
import PacketPage from './packet-page';

type Params = { params: Promise<{ packet: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { packet } = await params;
  return {
    title: `${packet} — research packet`,
    description: `Raw research output for packet ${packet}: facts, sources, locators, extracts, gaps and recorded conflicts.`,
  };
}

export default async function Page({ params }: Params) {
  const { packet } = await params;
  return <PacketPage packetId={packet} />;
}
