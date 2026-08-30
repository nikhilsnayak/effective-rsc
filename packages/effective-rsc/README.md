<picture>
  <source
    media="(prefers-color-scheme: dark)"
    srcset="https://github.com/nikhilsnayak/effective-rsc/blob/main/packages/effective-rsc/logo-dark.svg"
  />
  <img
    src="https://github.com/nikhilsnayak/effective-rsc/blob/main/packages/effective-rsc/logo.svg"
    alt=""
    width="72"
    height="72"
  />
</picture>

# effective-rsc

**React owns the UI. Effect owns the runtime.**

An experimental, Effect-native React Server Components framework for Bun. Built on Rspack's
native RSC support.

> A research framework, not a production-safe default. It runs on React Canary, Effect v4 RC,
> TypeScript 7, Rspack's RSC support, and browser APIs with no legacy fallbacks. Expect breakage.

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

- **[Effect is the application runtime](https://github.com/nikhilsnayak/effective-rsc/blob/main/packages/effective-rsc/docs/03-advanced/01-request-runtime-and-lifetimes/index.md).**
  Pages, Layouts, Components, and Server Functions retain inferred service requirements and run as
  request-scoped Effects. Provide the application Layer once; native Effect HTTP routes, APIs, RPC,
  and middleware share the same Bun server and lifetime.
- **[Navigation owns the full request lifetime](https://github.com/nikhilsnayak/effective-rsc/blob/main/packages/effective-rsc/docs/03-advanced/02-client-navigation/index.md).**
  The URL commits with visible UI while navigation remains active through Flight EOF. Cancellation
  and supersession interrupt obsolete browser and server work without desynchronizing the URL and
  visible UI.

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

`Application.ersc<Services>()` creates one application-scoped authoring module:

- `Page` is an Effectful route leaf and may decode typed path parameters with Schema.
- `Layout` is an Effectful wrapper with one `children` outlet; the root Layout owns the document.
- `Loading` is a synchronous, service-free Suspense fallback.
- `Component` defines an Effectful Server Component that is not itself a route.
- `ServerFn` adds Effect and Schema to React's native Server Function protocol.
- `Routes` immutably composes Pages, inherited middleware, and nested Layout/Loading scopes.

Create every Page, Layout, Loading, Component, ServerFn, and Routes value from that same ERSC
instance. Declare the complete service universe through its `Services` type parameter and provide the
application Layer at `ERSC.make({ layer })`.

## Runtime boundary

The package-root API is available only under the `react-server` condition. The framework build
enables that condition for application authoring modules; importing `effective-rsc` from another
runtime, including a Client Component, throws immediately.

## Example and documentation

The [kitchen-sink conference](https://github.com/nikhilsnayak/effective-rsc/tree/main/examples/kitchen-sink)
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
- [rsc-html-stream](https://github.com/devongovett/rsc-html-stream) by
  [Devon Govett](https://x.com/devongovett) embeds Flight in streamed HTML.

### Prior art

- [Next.js](https://github.com/vercel/next.js) is a reference for production RSC conventions and
  protocol behavior.
- [Waku](https://github.com/wakujs/waku) by [Daishi Kato](https://x.com/dai_shi) and
  [Twofold](https://github.com/twofold-rsc/twofold) by
  [Ryan Toronto](https://x.com/ryantotweets) demonstrated compact RSC framework design.
- [rspack-rsc](https://github.com/rstackjs/rstack-examples/tree/main/rspack/rspack-rsc),
  [rsbuild-plugin-rsc](https://github.com/rstackjs/rsbuild-plugin-rsc), and
  [Vite RSC](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc) provide
  reference implementations for RSC bundling and Server Function integration.
