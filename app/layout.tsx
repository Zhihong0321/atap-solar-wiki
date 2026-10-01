import type { Metadata } from 'next';
import { Geist, Geist_Mono, Source_Serif_4 } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

// The wiki reads as a reference publication, so it gets a text serif of its own.
const wikiSerif = Source_Serif_4({
  variable: '--font-wiki-serif',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  title: 'ATAP Solar Research Wiki',
  description: 'Source-first research on Malaysian solar PV — Solar ATAP, SELCO, NEM and more — with every fact traceable to its source.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable} ${wikiSerif.variable}`}>{children}</body></html>;
}
