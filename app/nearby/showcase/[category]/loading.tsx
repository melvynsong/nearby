// Route-level loading overlay for showcase detail
"use client";

import SiteLoadingState from '@/components/SiteLoadingState';

export default function ShowcaseDetailLoading() {
  return <SiteLoadingState context={{ page: 'showcase-detail' }} />;
}
