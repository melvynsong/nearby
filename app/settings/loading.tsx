"use client";

import SiteLoadingState from '@/components/SiteLoadingState';

export default function SettingsLoading() {
  return <SiteLoadingState context={{ page: 'settings' }} />;
}
