"use client";

import SiteLoadingState from '@/components/SiteLoadingState';

export default function AddPlaceLoading() {
  return <SiteLoadingState context={{ page: 'add-place' }} />;
}
