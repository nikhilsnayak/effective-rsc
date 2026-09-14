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

## Create an application

Requires Bun 1.4 or newer. The scaffold installs compatible React Canary and Effect dependencies.

```sh
bunx create-ersc-app my-application
cd my-application
bun run dev
```

Open `http://localhost:18193`. Define Pages, Layouts, and Routes in `src/application.tsx`; provide
application services with one Effect Layer. Server Functions validate inputs with Schema and work
with native React forms, or as client queries and streams.

Use `bun run check`, `bun run build`, and `bun run start` to verify and run production output.

Client navigation uses the Navigation API and `NavigationPrecommitController`. Browsers missing
either still hydrate Client Components and support Server Functions; links load full documents.
Without JavaScript, links and native forms continue to work.

## Why effective-rsc

ERSC brings server-rendered React, Effect services, and streaming work into one typed application.

- **Native React, with Effect and Schema.** Write Effectful Server Components and validate Server
  Function arguments with Schema. Service requirements stay inferred, while forms and
  `useActionState` retain React's native behavior, including submission without JavaScript.
- **One application runtime.** Provide services once through an Effect Layer and use them in Pages,
  Components, Server Functions, and native Effect HTTP routes. Middleware supplies request-local
  services; scopes manage server resources and shutdown.
- **Routes you can see and compose.** Define Pages, nested Layouts, Loading fallbacks, and middleware
  together in typed Routes. Only `src/application.tsx` has special meaning; organize the rest around
  your application.
- **Streaming UI and data.** Send useful HTML while slower content loads. Query Server Functions for
  values and React content, or consume their streams as chunks arrive. Effect, Stream, and atom
  helpers bring those results into client-side logic and state, with typed failures and cancellation.
- **Browser-native navigation.** Shared Layouts stay mounted while destinations load. URL, history,
  focus, and scroll advance when the destination first appears, while remaining content streams.
  Applications own their React View Transition boundaries and CSS; ERSC supplies navigation context.

## Documentation

- [Getting started](https://effective-rsc.nikhilsnayak.dev/docs/getting-started), including manual setup and styling.
- [Guides](https://effective-rsc.nikhilsnayak.dev/docs/guides): forms, queries, services, routing, middleware, HTTP, and deployment.
- [Advanced](https://effective-rsc.nikhilsnayak.dev/docs/advanced): lifetimes, navigation, refresh behavior, and startup.
- [API reference](https://effective-rsc.nikhilsnayak.dev/docs/api-reference).
- [Combined LLM reference](https://github.com/nikhilsnayak/effective-rsc/blob/main/packages/effective-rsc/LLMS.md).

These docs also ship in `node_modules/effective-rsc/docs` and `node_modules/effective-rsc/LLMS.md`.
Framework contributors should start with the [architecture docs](https://github.com/nikhilsnayak/effective-rsc/blob/main/docs/README.md).

## Examples

- [Hello world](https://github.com/nikhilsnayak/effective-rsc/tree/main/examples/hello-world): streaming, navigation, a counter, a form, and Vercel deployment.
- [Event platform](https://github.com/nikhilsnayak/effective-rsc/tree/main/examples/event-platform): a conference application with SQLite persistence.
- [Streaming feed](https://github.com/nikhilsnayak/effective-rsc/tree/main/examples/streaming-feed): server-seeded atoms, infinite scrolling, and streamed Server Components.

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
