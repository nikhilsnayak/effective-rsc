import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { createFromFetch } from 'react-server-dom-rspack/client.browser';
import type { RscPayload } from './entry.rsc';

async function main() {
  const initialPayload = await createFromFetch<RscPayload>(
    fetch(window.location.href, {
      headers: {
        Accept: 'text/x-component',
      },
    }),
  );

  function BrowserRoot() {
    return initialPayload.root;
  }

  hydrateRoot(
    document,
    <React.StrictMode>
      <BrowserRoot />
    </React.StrictMode>,
  );
}

main();
