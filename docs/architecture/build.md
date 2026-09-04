# Build and runtime graphs

## Framework package

Rslib emits framework modules as bundleless ESM with declarations and source maps under
`packages/effective-rsc/dist/`. The development panel is a separate browser bundle whose private UI
dependencies are embedded; React, React DOM, and Effect remain external peers. Published exports
point to built JavaScript, preserve RSC directives, and expose deliberate subpaths. The package also
ships its source guides and generated `LLMS.md`.

## Application build

`ersc build` runs a direct Rspack MultiCompiler with browser and server configurations. Rspack's RSC
plugins assign RSC and SSR layers, produce client-reference metadata, and coordinate assets. Output
lives in `.ersc/client/` and `.ersc/server/`; ERSC does not generate proxy source files.

A checked-in `'use server-entry'` module imports `src/application.tsx` through a private compiler
alias. Rspack supplies ordered JavaScript and stylesheet metadata to the compiled application.

The browser build targets the Navigation API browser floor and enables the React Compiler. It
rejects `bun:*` and `@effect/platform-bun` imports. The server build targets Bun's Node compatibility,
leaves `effect`, `@effect/*`, and `bun:*` external, and does not run the React Compiler. React, React
DOM, and `react-server-dom-rspack` use one exact compatible release.

CSS remains in Rspack's pipeline, including Tailwind CSS v4 through `@tailwindcss/webpack`.
`public/` is served at `/` by Effect `HttpStaticServer`; compiled assets are served below
`/_ersc/assets`.

Every compiled browser asset carries a content hash, so `/_ersc/assets` is served immutably from a
build and unstored in development, where one output directory is reused across rebuilds. The
compiled server bundle keeps a stable name instead, because `ersc start` resolves it by path.

## Development

`ersc dev` watches the same browser and server compiler graphs. A successful generation atomically
replaces the active server application. Browser updates use the compiler's HMR protocol; RSC changes
refresh the current route through the Navigation API. A streaming Effect RPC carries development
updates over `/_ersc/dev`. Development-only branches are removed from production builds. On
shutdown, the development channel closes active WebSockets before stopping the Bun HTTP server, so
connected browser tabs cannot retain the process. The channel accepts only WebSocket handshakes
whose `Origin` matches the development server.

Development diagnostics start independently of hydration. Current-route refresh initially reloads
the document; successful client-navigation activation replaces it with streamed RSC refresh.

React Server Components Performance Tracks remain native. Initial hydration uses the document
timeline origin; navigation and Server Function decoding receive a timestamp captured before HTTP
execution. Production compilation removes the timing metadata. React Debug Channel transport and
Loading-specific suspension diagnostics remain deferred.

## Owners

- [`build/rspack-config.ts`](../../packages/effective-rsc/src/build/rspack-config.ts)
- [`build/rsc-entry.ts`](../../packages/effective-rsc/src/build/rsc-entry.ts)
- [`build/build.ts`](../../packages/effective-rsc/src/build/build.ts)
- [`build/dev.ts`](../../packages/effective-rsc/src/build/dev.ts)
