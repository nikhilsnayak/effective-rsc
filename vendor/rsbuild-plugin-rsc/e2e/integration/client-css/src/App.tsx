'use server-entry';

import { StaticClientCard } from './StaticClientCard.tsx';
import './App.css';

export async function App() {
  const { DynamicClientCard } = await import('./DynamicClientCard.tsx');

  return (
    <html lang="en">
      <head>
        <title>Client CSS</title>
      </head>
      <body>
        <main className="page-shell">
          <h1>Client CSS resources</h1>
          <div className="client-css-grid">
            <StaticClientCard />
            <DynamicClientCard />
          </div>
        </main>
      </body>
    </html>
  );
}
