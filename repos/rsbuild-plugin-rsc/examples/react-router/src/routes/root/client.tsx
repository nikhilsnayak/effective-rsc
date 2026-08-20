'use client';

import {
  isRouteErrorResponse,
  NavLink,
  useNavigation,
  useRouteError,
} from 'react-router';

export function Layout({ children }: { children: React.ReactNode }) {
  const navigation = useNavigation();

  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <div>
            <p className="eyebrow">Rsbuild + React Router RSC</p>
            <strong>React Router Demo</strong>
          </div>
          <nav className="app-nav" aria-label="Primary">
            <NavLink to="/" end>
              Home
            </NavLink>
            <NavLink to="/about">About</NavLink>
          </nav>
          <p
            className="app-status"
            data-navigation-state={navigation.state}
            aria-live="polite"
          >
            {navigation.state === 'idle' ? 'Ready' : 'Loading...'}
          </p>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let status = 500;
  let message = 'An unexpected error occurred.';

  if (isRouteErrorResponse(error)) {
    status = error.status;
    message = status === 404 ? 'Page not found.' : error.statusText || message;
  }

  return (
    <main className="mx-auto max-w-screen-xl px-4 py-8 lg:py-12">
      <article className="prose mx-auto">
        <h1>{status}</h1>
        <p>{message}</p>
      </article>
    </main>
  );
}
