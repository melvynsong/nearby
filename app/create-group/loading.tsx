"use client";

import SiteLoadingState from '@/components/SiteLoadingState';

export default function CreateGroupLoading() {
  return <SiteLoadingState context={{ page: 'create-group' }} />;
}
