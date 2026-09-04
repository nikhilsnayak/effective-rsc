import { type ReactElement, Suspense, use } from 'react';
import {
  createFromFetch,
  createTemporaryReferenceSet,
  encodeReply,
} from 'react-server-dom-rspack/client.browser';

async function fetchRSC<T>(
  url: string | URL | Request,
  options?: RequestInit,
): Promise<T> {
  const temporaryReferences = createTemporaryReferenceSet();
  const response = fetch(url, {
    ...options,
    headers: {
      Accept: 'text/x-component',
      ...options?.headers,
    },
    body:
      options && 'body' in options
        ? await encodeReply(options.body, { temporaryReferences })
        : undefined,
  });

  return createFromFetch<T>(response, { temporaryReferences });
}

export function App() {
  return (
    <>
      <h1>Client rendered</h1>
      <Suspense fallback={<>Loading RSC</>}>
        <RSC />
      </Suspense>
    </>
  );
}

let request: Promise<ReactElement> | null = null;

function RSC() {
  // Simple cache to make sure we only fetch once.
  request ??= fetchRSC('/');
  return use(request);
}

// implement server HMR by triggering re-fetch/render of RSC upon server code change
if (import.meta.webpackHot) {
  import.meta.webpackHot.on('rsc:update', () => {
    console.log('[rsc:update]');
    window.location.reload();
  });
}
