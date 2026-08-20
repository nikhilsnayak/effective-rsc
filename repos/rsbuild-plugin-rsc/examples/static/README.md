# Rsbuild RSC Static Rendering Example

This example demonstrates a multi-page static site built with Rsbuild and React Server Components (RSC). It showcases file-based page routing, static site generation (SSG), client-side hydration, and client-side navigation between pages — all powered by `rsbuild-plugin-rsc`.

## Getting Started

```bash
# Start development server
pnpm dev

# Build for production (includes static HTML generation)
pnpm build

# Preview the production build
pnpm preview
```

## Project Structure

```
src/
├── pages/           # Page components (file-based routing)
│   ├── Index.tsx
│   └── Other.tsx
├── components/      # Shared components
│   ├── Counter.tsx   # Client component
│   ├── Nav.tsx       # Server component
│   └── style.css
└── framework/       # Framework layer
    ├── entry.rsc.tsx    # RSC entrypoint (server)
    ├── entry.ssr.tsx    # SSR entrypoint (server)
    ├── entry.client.tsx # Client entrypoint (browser)
    ├── request.tsx      # RSC/SSR request routing
    ├── shared.tsx       # Shared types
    └── ssg.tsx          # Page types
generate.mjs             # Post-build static generation script
```

### Build Output

After `pnpm build`, the `dist/` directory contains a fully static site:

```
dist/
├── index.html           # Pre-rendered HTML for /index
├── other.html           # Pre-rendered HTML for /other
├── index_.rsc           # RSC payload for client-side navigation
├── other_.rsc           # RSC payload for client-side navigation
├── static/
│   ├── js/              # Client JavaScript bundles
│   └── css/             # Client CSS bundles
└── server/
    └── index.js         # Server bundle (used during generation only)
```

### Page Components (`src/pages/*.tsx`)

Each file under `src/pages/` represents a page. Pages are React Server Components that render the full `<html>` document tree using the `"use server-entry"` directive. The file name determines the route (e.g., `Index.tsx` → `/index`, `Other.tsx` → `/other`).

```tsx
'use server-entry';

import { Counter } from '../components/Counter';
import { Nav } from '../components/Nav';

export default function Index({ pages, currentPage }: PageProps) {
  return (
    <html lang="en">
      <head>
        <title>Static RSC</title>
      </head>
      <body>
        <h1>This is an RSC!</h1>
        <Nav pages={pages} currentPage={currentPage} />
        <Counter />
      </body>
    </html>
  );
}
```

Pages are automatically discovered at build time via `import.meta.webpackContext` in `entry.rsc.tsx`, so adding a new `.tsx` file to `src/pages/` is all that's needed to create a new route.

### Server Components (`src/components/Nav.tsx`)

Server components run only on the server. `Nav` renders a list of links for all pages, highlighting the current page via `aria-current`.

### Client Components (`src/components/Counter.tsx`)

Client components use the `"use client"` directive and run in the browser. `Counter` demonstrates interactive state with `useState`.

## Framework Layer

### RSC Entrypoint (`src/framework/entry.rsc.tsx`)

The RSC entrypoint runs in the `react-server-components` layer. It:

1. Discovers all pages under `src/pages/` using `import.meta.webpackContext`
2. Exports `getStaticPaths()` to list all routes for static generation
3. Exports `renderStaticPage(route)` and `renderStaticRsc(route)` for SSG
4. Provides a dev server handler for development mode

CSS and JS bootstrap files are automatically resolved via `entryCssFiles` and `entryJsFiles` injected by the RSC plugin on `"use server-entry"` components.

### SSR Entrypoint (`src/framework/entry.ssr.tsx`)

The SSR entrypoint consumes the RSC stream and renders it to an HTML stream using `react-dom/server`. It supports both SSG (via `prerender()`) and runtime SSR (via `renderToReadableStream()`). The RSC payload is injected into the HTML via `rsc-html-stream` for seamless client hydration.

### Client Entrypoint (`src/framework/entry.client.tsx`)

The client entrypoint hydrates the server-rendered HTML using the embedded RSC payload. It also implements a simple client-side router that:

- Intercepts link clicks to perform client-side navigation
- Fetches pre-generated RSC payloads for new pages (via `_.rsc` URL convention)
- Updates the page without a full browser reload

## Rsbuild Configuration

The `rsbuild.config.ts` configures two environments and a static generation plugin:

- **server**: Builds `entry.rsc.tsx` with the RSC layer, outputs to `dist/server/`
- **client**: Builds `entry.client.tsx` for browser hydration and navigation
- **pluginStaticGenerate**: Runs `generate.mjs` after build to produce static HTML and RSC payloads

```ts
import { Layers, pluginRSC } from 'rsbuild-plugin-rsc';

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginRSC({
      layers: {
        ssr: path.join(import.meta.dirname, './src/framework/entry.ssr.tsx'),
      },
    }),
    pluginStaticGenerate(),
  ],
  environments: {
    server: {
      source: {
        entry: {
          index: {
            import: './src/framework/entry.rsc.tsx',
            layer: Layers.rsc,
          },
        },
      },
      output: {
        distPath: { root: 'dist/server' },
      },
    },
    client: {
      source: {
        entry: {
          index: './src/framework/entry.client.tsx',
        },
      },
    },
  },
});
```

## How It Works

### Build-Time Static Generation (SSG)

1. Rsbuild builds both the server bundle and client assets
2. The `pluginStaticGenerate` plugin runs `generate.mjs` after the build
3. `generate.mjs` loads the server bundle and calls `getStaticPaths()` to discover all routes
4. For each route, it generates:
   - An HTML file with pre-rendered content, embedded RSC payload, and client bootstrap scripts/CSS
   - An RSC payload file (`_.rsc`) for client-side navigation
5. The result is a fully static site that can be served by any static file server

### Initial Page Load

1. Browser requests a URL (e.g., `/index.html`)
2. The browser receives pre-rendered HTML with embedded RSC payload
3. Client JavaScript hydrates the page using the embedded RSC payload

### Client-Side Navigation

1. User clicks a link (e.g., from `Index` to `Other`)
2. The client router intercepts the click and calls `history.pushState`
3. The client fetches the pre-generated RSC payload for the new page (e.g., `/other_.rsc`)
4. React updates the page in-place without a full reload
