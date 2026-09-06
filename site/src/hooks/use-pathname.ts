'use client';

import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  const navigation = window.navigation;
  navigation?.addEventListener('currententrychange', callback);
  return () => navigation?.removeEventListener('currententrychange', callback);
}

function getPathname() {
  return window.location.pathname;
}

function getServerPathname() {
  return null;
}

export function usePathname() {
  return useSyncExternalStore(subscribe, getPathname, getServerPathname);
}
