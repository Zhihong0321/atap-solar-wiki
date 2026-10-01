import type { Metadata } from 'next';
import CategoryPage from './category-page';

type Params = { params: Promise<{ domain: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { domain } = await params;
  return {
    title: `${domain} — research category`,
    description: `Research packets, sources and reviewed pages in the ${domain} category.`,
  };
}

export default async function Page({ params }: Params) {
  const { domain } = await params;
  return <CategoryPage domainId={domain} />;
}
