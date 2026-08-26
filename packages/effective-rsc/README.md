# effective-rsc

An experimental React Server Components framework where React owns the UI protocol and Effect owns
the application runtime. It uses Rspack's native RSC support and targets Bun.

## Minimal application

Create `src/application.tsx`:

```tsx
import { Effect } from 'effect';
import { Application } from 'effective-rsc';

import './application.css';

const ERSC = Application.ersc();

const RootLayout = ERSC.Layout.make({
  render: ({ children }) =>
    Effect.succeed(
      <html lang='en'>
        <body>{children}</body>
      </html>,
    ),
});

const HomePage = ERSC.Page.make({
  render: () => Effect.succeed(<h1>Hello from effective-rsc</h1>),
});

export default ERSC.make({
  routes: ERSC.Routes.make({ layout: RootLayout }).page('/', HomePage),
});
```

Styles are ordinary module imports. Tailwind is supported through the same CSS pipeline; for
example, `src/application.css` can contain:

```css
@import 'tailwindcss';
```

Then build and run:

```sh
bunx ersc build
bunx ersc start
```

The server listens on `http://localhost:18193` by default.

## The six authoring concepts

- `Page` is an Effectful route leaf and may decode typed path parameters with Schema.
- `Layout` is an Effectful wrapper with one `children` outlet; the root Layout owns the document.
- `Loading` is a synchronous, service-free Suspense fallback.
- `Component` adapts an Effectful Server Component that is not itself a route.
- `ServerFn` adds Effect and Schema to React's native Server Function protocol.
- `Routes` immutably composes Pages and nested Layout/Loading scopes through `page` and `mount`.

Declare the complete service universe with `Application.ersc<Services>()`, provide its implementations
at `ERSC.make({ servicesLayer })`, and create every Page, Layout, Loading, Component, ServerFn, and
Routes value from that same ERSC instance.

## Requirements

- Bun 1.4 or newer is the only supported server runtime.
- React, React DOM, and `react-server-dom-rspack` must use the exact compatible versions required by
  the package.
- The browser must support the Navigation API and `NavigationPrecommitController`; there is no
  History API fallback.
- The package-root API is a React Server Components authoring API. Importing it outside the
  `react-server` condition throws immediately.

See the [architecture](https://github.com/nikhilsnayak/effective-rsc/blob/main/docs/ARCHITECTURE.md),
[decision register](https://github.com/nikhilsnayak/effective-rsc/blob/main/docs/DECISIONS.md), and
[open questions](https://github.com/nikhilsnayak/effective-rsc/blob/main/docs/OPEN_QUESTIONS.md).
