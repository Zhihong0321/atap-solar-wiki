import type { Metadata } from 'next';
import EligibilityArticle from './eligibility-article';

export const metadata: Metadata = {
  title: 'Solar ATAP eligibility — Peninsular Malaysia',
  description: 'Who can join Solar ATAP in Peninsular Malaysia, who is excluded, and the capacity, location and duration limits — with the regulator source behind every statement.',
};

export default function SolarAtapEligibility() {
  return <EligibilityArticle />;
}
