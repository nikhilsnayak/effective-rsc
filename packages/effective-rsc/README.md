<picture>
  <source
    media="(prefers-color-scheme: dark)"
    srcset="https://raw.githubusercontent.com/nikhilsnayak/effective-rsc/main/packages/effective-rsc/logo-dark.svg"
  />
  <img
    src="https://raw.githubusercontent.com/nikhilsnayak/effective-rsc/main/packages/effective-rsc/logo.svg"
    alt=""
    width="72"
    height="72"
  />
</picture>

# effective-rsc

**React owns the UI. Effect owns the runtime.**

An experimental, Effect-native React Server Components framework for Bun. Built on Rspack's
native RSC support.

> Experimental. Uses React Canary, Effect v4 RC, TypeScript 7, Rspack's RSC support, and modern
> browser APIs. [Current limitations](https://github.com/nikhilsnayak/effective-rsc/blob/main/docs/ARCHITECTURE.md#known-limitations).

## Requirements

- Bun 1.4 or newer is the only supported server runtime.
- Client navigation and hydration require the Navigation API and `NavigationPrecommitController`;
  there is no History API fallback. Browsers without them receive the server-rendered document as a
  plain multi-page application, with working links and natively submitted forms.
- React, React DOM, Effect, Effect's browser and Bun platforms, and
  `react-server-dom-rspack` must use the exact compatible versions shown below.

## Create an application

```sh
bunx create-ersc-app my-effective-rsc-app
cd my-effective-rsc-app
bun run dev
```

Run `bunx create-ersc-app` without a directory for the interactive flow.

## Why effective-rsc

effective-rsc is built around three deliberate constraints:

- **Effect owns the application runtime.** Pages, Layouts, Components, and Server Functions retain
  inferred service requirements and run as request-scoped Effects. One application Layer provides
  services and native Effect HTTP; Effect scopes own resources, interruption, and shutdown.
- **Routes and ownership are explicit.** One application-scoped ERSC identity composes an immutable
  route graph in `src/application.tsx`. Concern identity, middleware reach, and service requirements
  remain visible in that composition.
- **Navigation is browser-native.** ERSC intercepts the Navigation API and settles it at the
  destination's first UI commit, so URL/history, focus, scroll, and React View Transitions are not
  blocked by Flight EOF. The router retains the remaining stream until EOF or render retirement,
  and tags publication with navigation, direction, UA visual-transition, Server Function, and HMR
  transition types while applications own the `<ViewTransition>` boundaries and CSS.

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
  @types/react-dom@19.2.5
```

Add the framework commands to `package.json`:

```json
{
  "type": "module",
  "scripts": {
    "dev": "ersc dev",
    "check": "tsc --noEmit",
    "build": "ersc build",
    "start": "ersc start"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "noEmit": true,
    "strict": true,
    "erasableSyntaxOnly": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noUncheckedSideEffectImports": true,
    "types": ["bun", "react", "react-dom", "react/canary"],
    "lib": ["ESNext", "DOM", "DOM.Iterable"]
  },
  "include": ["src"]
}
```

Create `src/environment.d.ts` so TypeScript accepts stylesheet imports:

```ts
declare module '*.css' {}
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

Run `bun run dev`, then open `http://localhost:18193`. For a production run, use `bun run check`,
`bun run build`, and `bun run start`.

For deployment, `ersc start` accepts `--hostname` and `--port`. Command-line flags take precedence
over `HOST` and `PORT`; the defaults are `localhost` and `18193`.

## Styling

Import stylesheets from the modules that use them; there is no framework stylesheet entry point:

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

`Application.ersc<Services>()` creates one application-scoped ERSC identity and its base authoring
view:

- `Page` is an Effectful route leaf and may decode typed path parameters with Schema.
- `Layout` is an Effectful wrapper with one `children` outlet; the root Layout owns the document.
- `Loading` is a synchronous, service-free Suspense fallback.
- `Component` defines an Effectful Server Component that is not itself a route.
- `ServerFn` adds Effect and Schema to React's native Server Function protocol.
- `Middleware` adapts Effect HTTP middleware and may provide typed request services.
- `Routes` immutably composes Pages and nested Layout/Loading scopes and activates middleware
  retained by its authoring view.

Create application values from one ERSC identity and its derived middleware views.
`ERSC.withMiddleware(middleware)` derives a view whose values retain that middleware scope. Declare
the complete service universe through `Services` and provide the application Layer at
`ERSC.make({ layer })`.

## Runtime boundary

The package-root API is available only under the `react-server` condition. The framework build
enables that condition for application authoring modules; importing `effective-rsc` from another
runtime, including a Client Component, throws immediately.

## Example and documentation

The [event platform](https://github.com/nikhilsnayak/effective-rsc/tree/main/examples/event-platform)
is the complete application example.

- [Getting started](https://github.com/nikhilsnayak/effective-rsc/blob/main/packages/effective-rsc/docs/01-getting-started/index.md)
- [Guides](https://github.com/nikhilsnayak/effective-rsc/blob/main/packages/effective-rsc/docs/02-guides/index.md)
- [Advanced](https://github.com/nikhilsnayak/effective-rsc/blob/main/packages/effective-rsc/docs/03-advanced/index.md)
- [API reference](https://github.com/nikhilsnayak/effective-rsc/blob/main/packages/effective-rsc/docs/04-api-reference/index.md)
- [Combined LLM reference](https://github.com/nikhilsnayak/effective-rsc/blob/main/packages/effective-rsc/LLMS.md)

## Credits

### Key dependencies

- [Rspack](https://github.com/web-infra-dev/rspack) and
  [react-server-dom-rspack](https://www.npmjs.com/package/react-server-dom-rspack) provide native
  RSC compilation and transport. Special thanks to [Cong-Cong Pan](https://github.com/SyMind) for
  their work on Rspack's RSC implementation.

### Prior art

- [rsc-html-stream](https://github.com/devongovett/rsc-html-stream) by
  [Devon Govett](https://x.com/devongovett) established the compact streamed-HTML Flight embedding
  shape adapted by ERSC's injector.
- [Next.js](https://github.com/vercel/next.js) is a reference for production RSC conventions and
  protocol behavior.
- [Waku](https://github.com/wakujs/waku) by [Daishi Kato](https://x.com/dai_shi) and
  [Twofold](https://github.com/twofold-rsc/twofold) by
  [Ryan Toronto](https://x.com/ryantotweets) demonstrated compact RSC framework design.
- [rspack-rsc](https://github.com/rstackjs/rstack-examples/tree/main/rspack/rspack-rsc),
  [rsbuild-plugin-rsc](https://github.com/rstackjs/rsbuild-plugin-rsc), and
  [Vite RSC](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc) provide
  reference implementations for RSC bundling and Server Function integration.
