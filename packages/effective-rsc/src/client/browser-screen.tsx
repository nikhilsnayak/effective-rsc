import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

export function BrowserFailureScreen() {
  return (
    <main>
      <h1>Something went wrong</h1>
      <p>Reload the page to try again.</p>
      <button type='button' onClick={() => window.location.reload()}>
        Reload
      </button>
    </main>
  );
}

export function UnsupportedBrowserScreen() {
  return (
    <main>
      <h1>Unsupported browser</h1>
      <p>effective-rsc requires the Navigation API and NavigationPrecommitController.</p>
    </main>
  );
}

const renderBrowserScreen = (screen: ReactNode) => {
  const container = document.createElement('div');
  document.body.replaceChildren(container);
  createRoot(container).render(screen);
};

export const showBrowserFailure = () => renderBrowserScreen(<BrowserFailureScreen />);
export const showUnsupportedBrowser = () => renderBrowserScreen(<UnsupportedBrowserScreen />);
