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

The browser build enables Strict Mode and runs the React Compiler only on the application's `src/`
tree, excluding `node_modules` and workspace-linked dependencies. Dependency modules still receive
RSC directive processing. Browser resolution rejects unavailable server modules; there is no bespoke
Bun-import guard. Production uses compact hashed chunk and module identifiers.

The server build targets Bun's Node compatibility and omits the React Compiler. Only `bun:*` and
`effect` are external: Bun supplies the former, and Effect's migration loader uses computed imports.
Other dependencies are bundled so React-dependent packages resolve against their RSC or SSR layer.
React, React DOM, and `react-server-dom-rspack` use the exact compatible releases in the root catalog.

Imported images, fonts, and media become content-addressed assets of the browser build. The server
graph resolves the same URLs so a Server Component can reference one, without writing the file twice.
`effective-rsc/types` declares every module the compiler resolves but TypeScript cannot infer,
including stylesheets; applications reference it once. Anything else stays a conventional `public/`
file.

CSS remains in Rspack's pipeline, including Tailwind CSS v4 through `@tailwindcss/webpack`. The
browser build owns every stylesheet asset. The server graph keeps its CSS modules so Rspack can order
stylesheet metadata, but a pitching loader discards their bytes before Tailwind reads them, so one
build never compiles the same stylesheet twice. `public/` is served at `/` by Effect
`HttpStaticServer`; compiled assets are served below `/_ersc/assets`.

Every compiled browser asset carries a content hash, so `/_ersc/assets` is served immutably from a
build and unstored in development, where one output directory is reused across rebuilds. Requests
for these compiler-owned assets skip the per-request logger; public assets and application routes
remain logged. Production server bundles use stable `[name].js` paths for `ersc start`.
Development server entries and chunks use `[name].[contenthash].js` and remain for the session.

## Production entry

`effective-rsc/server` exports `start({ root, hostname, port })`. Its Promise resolves after
the application Layer and HTTP server are ready; failure rejects before process exit. ERSC owns
signals and scoped cleanup. Imports are inert, and `ersc start` shares the same initialization.

Deployments retain `.ersc/`, `public/`, and external runtime dependencies. This is Bun startup,
not a request-handler API or alternate runtime adapter.

## Deployment adapters

`ersc build --adapter <package>` resolves `<package>/build` from the app root and runs its
exported `build` hook after compilation. Resolution, contract, and hook failures fail the build.
There is no autodetection, installation, or upload. Omitting the flag leaves prior output intact.

`effective-rsc/build` exports `BuildContext` and `BuildHook` types: absolute `root`, `serverDir`,
`clientDir`, and `publicDir` inputs, and an `Effect<void, Error, Scope>` result. Adapters treat
inputs as read-only and provide their dependencies; core owns scope/cancellation. Adapter code
is trusted. Compilation and packaging report separately; success follows scoped cleanup.

### Vercel package

`@ersc/vercel` generates `.vercel/output/` with one Bun 1.4 function using the existing router.
Its entry sets the application cwd before importing `effective-rsc/server`. It traces every server
JavaScript chunk with Bun/Node/native-addon conditions, widening the trace root for hoisted
dependencies. Tracing failures preserve prior output; packaging does not modify `.ersc/`.

Traced dependency symlinks are relocated; client/public asset symlinks are materialized.
Broken, cyclic, or destination-containing asset links fail. Everything linked from `public/`
is public. Computed file reads may escape tracing; local databases are not made persistent.
Vercel project settings and deployment remain separate setup; see [the adapter README](../../packages/vercel/README.md).

## Releases

`bun run release <version>` checks aligned framework, adapter, CLI, and template versions,
runs verification and package dry runs, then asks before publishing and pushing the release tag.
For releases from `main`, it then advances the site's tarball-pinned documentation dependency to the
published framework version, verifies the site build, commits the pin, and pushes `main`. Maintenance
branch releases require that promotion after their release commit reaches `main`. A failed promotion
resumes with `bun run release:promote-docs <version>`; it accepts only its manifest and lockfile
changes or its single unpushed commit. GitHub creates a draft release.

## Development

`ersc dev` watches the same compiler graphs and uses one Bun/Effect HTTP server. A generation
contains its application services and requests:

- Initialize a replacement fully before atomically admitting new requests to it. Admission waits
  for the current compilation outcome; compilation or startup failures reject new requests.
- Successful replacement interrupts old handlers and response streams before disposing services.
  There is no draining or automatic Server Function retry. Failed candidates leave existing requests
  on the current generation alone.
- A rebuild interrupts pending startup and awaits cleanup before starting the next candidate.
  Waiting requests follow the new compilation outcome. Failed candidates never publish success.
- Keep content-hashed server bundles and chunks for the development session.

The Rspack persistent cache lives at `node_modules/.cache/ersc/rspack`. Framework version,
application manifest, and TypeScript configuration invalidate it; Rspack expires unused entries.
Production compiles without a cache.

### Updates and diagnostics

An Effect RPC stream at `/_ersc/dev` carries development updates; WebSocket handshakes require an
Origin matching the development server. Apply Rspack HMR and
React Fast Refresh before refreshing changed RSC content through Flight. Production removes this
channel and development-only branches. At shutdown, close channel WebSockets before stopping Bun;
request cleanup precedes generation service disposal.

Diagnostics start before hydration. Current-route refresh initially reloads the document; successful
hydration installs streamed refresh. The first successful socket snapshot reconciles a hash that
differs from the loaded browser bundle. Missing navigation APIs produce a console warning and a
persistent dismissible panel notice; failures take precedence, and production omits the warning.

Build and runtime diagnostics have independent recovery:

- Compilation/startup failures appear in the terminal and panel. Only a successful replacement
  clears build diagnostics; renders and cached traversal cannot clear them.
- Caught React failures include component stacks. Only a successful recovery commit clears runtime
  diagnostics; starting a refresh or completing a build does not. HMR or navigation can recover the
  root error boundary without remounting healthy trees. Application boundaries own their recovery.
- Recovery never replays a Server Function or retries unchanged code on a timer.

Native React Server Components Performance Tracks use the document timeline for hydration and a
pre-HTTP timestamp for navigation and Server Function decoding. Production removes timing metadata.
Debug Channel transport and Loading-specific suspension diagnostics remain deferred.

## Owners

- [`build/rspack-config.ts`](../../packages/effective-rsc/src/build/rspack-config.ts)
- [`build/rsc-entry.ts`](../../packages/effective-rsc/src/build/rsc-entry.ts)
- [`build/build.ts`](../../packages/effective-rsc/src/build/build.ts)
- [`build/dev.ts`](../../packages/effective-rsc/src/build/dev.ts)
