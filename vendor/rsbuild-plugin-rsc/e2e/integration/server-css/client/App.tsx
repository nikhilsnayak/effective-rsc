import { type ReactElement, Suspense, use } from 'react';
import { createFromFetch } from 'react-server-dom-rspack/client.browser';

function fetchRSC(url: string): Promise<ReactElement> {
  return createFromFetch(
    fetch(url, {
      headers: {
        Accept: 'text/x-component',
      },
    }),
  );
}

let request:
  | {
      url: string;
      response: Promise<ReactElement>;
    }
  | undefined;

function ServerContent() {
  const url = `${window.location.pathname}${window.location.search}`;
  if (!request || request.url !== url) {
    request = {
      url,
      response: fetchRSC(url),
    };
  }
  return use(request.response);
}

export function App() {
  return (
    <main>
      <h1>Client shell</h1>
      <Suspense fallback={<p>Loading RSC</p>}>
        <ServerContent />
      </Suspense>
    </main>
  );
}
