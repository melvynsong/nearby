import ShowcasePageClient from './ShowcasePageClient';
import { getAvailableShowcases, getShowcaseListLimit } from '@/lib/showcase-config';
import { getServerSupabaseClient } from '@/lib/server-supabase';

export const metadata = {
  title: 'Nearby Food Showcases',
  description: 'Curated Singapore food showcases — top dishes loved by the community.',
};

export default async function Page() {
  const db = getServerSupabaseClient();
  const limit = getShowcaseListLimit();
  const showcases = await getAvailableShowcases(db, limit);
  return <ShowcasePageClient showcases={showcases} />;
}
