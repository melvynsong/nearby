"use client";

import SiteLoadingState from '@/components/SiteLoadingState';

export default function JoinGroupLoading() {
  return <SiteLoadingState context={{ page: 'join-group' }} />;
}
