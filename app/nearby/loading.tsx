"use client";

import SiteLoadingState from '@/components/SiteLoadingState';

export default function NearbyHomeLoading() {
  return <SiteLoadingState context={{ page: 'nearby-home' }} />;
}
