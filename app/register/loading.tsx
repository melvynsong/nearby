"use client";

import SiteLoadingState from '@/components/SiteLoadingState';

export default function RegisterLoading() {
  return <SiteLoadingState context={{ page: 'register' }} />;
}
