import '@repo/ui/globals.css';
import { RegistryProvider } from '@effect/atom-react';
import { serverUrlAtom } from '@repo/client-runtime/Config';
import { Toaster } from '@repo/ui/components/toast';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import { routeTree } from './routeTree.gen';

const serverUrl = import.meta.env.VITE_SERVER_URL;
if (serverUrl === undefined) {
  throw new Error('VITE_SERVER_URL is required.');
}

const router = createRouter({
  routeTree,
  scrollRestoration: true,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Root element not found.');
}

const root = ReactDOM.createRoot(rootElement);

root.render(
  <StrictMode>
    <RegistryProvider initialValues={[[serverUrlAtom, serverUrl]]}>
      <RouterProvider router={router} />
      <Toaster />
    </RegistryProvider>
  </StrictMode>,
);
