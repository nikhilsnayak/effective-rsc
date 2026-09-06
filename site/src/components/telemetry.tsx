'use client';

import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

import { usePathname } from '../hooks/use-pathname';

export function Telemetry() {
  const pathname = usePathname();
  return (
    <>
      {/* Explicit paths track Navigation API commits and disable automatic pageviews. */}
      <Analytics route={pathname} path={pathname} />
      <SpeedInsights />
    </>
  );
}
