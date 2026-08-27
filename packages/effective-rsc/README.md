# effective-rsc

An experimental React Server Components framework where React owns the UI protocol and Effect owns
the application runtime. It uses Rspack's native RSC support and targets Bun.

## Requirements

- Bun 1.4 or newer is the only supported server runtime.
- The browser must support the Navigation API and `NavigationPrecommitController`; there is no
  History API fallback.
- React, React DOM, Effect, Effect's browser and Bun platforms, and
  `react-server-dom-rspack` must use the exact compatible versions shown below.

## Create an application

Bootstrap a complete application with the compatible dependency versions:

```sh
bunx create-ersc-app my-effective-rsc-app
cd my-effective-rsc-app
bun run check
bun run build
bun run start
```

Run `bunx create-ersc-app` without a directory for the interactive flow.

## Manual installation

Create a Bun package and install the framework with its exact compatible peers:

```sh
mkdir my-effective-rsc-app
cd my-effective-rsc-app
bun init -y
bun add effective-rsc \
  effect@4.0.0-rc.112 \
  @effect/platform-browser@4.0.0-rc.112 \
  @effect/platform-bun@4.0.0-rc.112 \
  react@19.3.0-canary-a1124489-20260826 \
  react-dom@19.3.0-canary-a1124489-20260826 \
  react-server-dom-rspack@0.1.0
bun add --dev \
  typescript@7.0.2 \
  @types/bun@^1.4.0 \
  @types/react@19.2.18 \
  @types/react-dom@19.2.4
```

Add the framework commands to `package.json`:

```json
{
  "type": "module",
  "scripts": {
    "check": "tsc --noEmit",
    "build": "ersc build",
    "start": "ersc start"
  }
}
```

## Quick start

Create `src/application.tsx`:

```tsx
import { Effect } from 'effect';
import { Application } from 'effective-rsc';

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

Type-check, build, and start the application:

```sh
bun run check
bun run build
bun run start
```

Open `http://localhost:18193`.

## Styling

Stylesheets have no special filename or framework entry point. Import them from the modules that use
them:

```tsx
import './styles.css';
```

Tailwind uses the same CSS pipeline. Install it:

```sh
bun add --dev tailwindcss@4.3.3
```

Then create a stylesheet, such as `src/styles.css`:

```css
@import 'tailwindcss';
```

## Authoring model

`Application.ersc<Services>()` creates one application-scoped authoring module with six concepts:

- `Page` is an Effectful route leaf and may decode typed path parameters with Schema.
- `Layout` is an Effectful wrapper with one `children` outlet; the root Layout owns the document.
- `Loading` is a synchronous, service-free Suspense fallback.
- `Component` adapts an Effectful Server Component that is not itself a route.
- `ServerFn` adds Effect and Schema to React's native Server Function protocol.
- `Routes` immutably composes Pages and nested Layout/Loading scopes through `page` and `mount`.

Create every Page, Layout, Loading, Component, ServerFn, and Routes value from that same ERSC
instance. Declare the complete service universe through its `Services` type parameter and provide the
implementations at `ERSC.make({ servicesLayer })`.

## Runtime boundary

The package-root API is available only under the `react-server` condition. The framework build
enables that condition for application authoring modules; importing `effective-rsc` from another
runtime, including a Client Component, throws immediately.

## Example and documentation

The [kitchen-sink conference](https://github.com/nikhilsnayak/effective-rsc/tree/main/examples/kitchen-sink)
is the complete application example and end-to-end integration fixture.

- [Getting started](./docs/01-getting-started/index.md)
- [Guides](./docs/02-guides/index.md)
- [API reference](./docs/03-api-reference/index.md)
- [Combined LLM reference](./LLMS.md)
- [Architecture](https://github.com/nikhilsnayak/effective-rsc/blob/main/docs/ARCHITECTURE.md)
- [Decision register](https://github.com/nikhilsnayak/effective-rsc/blob/main/docs/DECISIONS.md)
- [Open questions](https://github.com/nikhilsnayak/effective-rsc/blob/main/docs/OPEN_QUESTIONS.md)
