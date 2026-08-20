'use server-entry';

import type { ServerEntry } from 'react-server-dom-rspack/server.node';
import { Outlet } from 'react-router';
import { Layout as ClientLayout } from './client';
import './styles.css';

export { ErrorBoundary } from './client';

export function Layout({ children }: { children: React.ReactNode }) {
  const layoutEntry = Layout as ServerEntry<typeof Layout>;

  // This is required for the bundler to inject the necessary CSS assets.
  return (
    <>
      {layoutEntry.entryCssFiles?.map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence="default" />
      ))}
      <ClientLayout>{children}</ClientLayout>
    </>
  );
}

export default function Component() {
  return <Outlet />;
}
