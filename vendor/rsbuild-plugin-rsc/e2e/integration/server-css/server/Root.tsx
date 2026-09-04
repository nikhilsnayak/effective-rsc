import type { ReactNode } from 'react';
import './Root.css';
import './Shared.css';

type ServerCssPage = 'page1' | 'page2';

type RootProps = {
  activePage: ServerCssPage;
  children: ReactNode;
};

export async function Root({ activePage, children }: RootProps) {
  return (
    <section className="server-css-root" data-testid="server-css-root">
      <h2>Server CSS root</h2>
      <p>This root stylesheet is not owned by a server-entry component.</p>
      <nav aria-label="Server CSS pages">
        <a
          href="/?page=page1"
          aria-current={activePage === 'page1' ? 'page' : undefined}
        >
          Page 1
        </a>
        <a
          href="/?page=page2"
          aria-current={activePage === 'page2' ? 'page' : undefined}
        >
          Page 2
        </a>
      </nav>
      <p className="shared-server-css" data-testid="server-css-shared-root">
        Shared stylesheet from root
      </p>
      <div className="server-css-pages">{children}</div>
    </section>
  );
}
