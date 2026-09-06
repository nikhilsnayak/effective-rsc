## Production startup

Run `ersc build`, then `ersc start`. A custom Bun entry can await
`start({ root, hostname, port })` from `effective-rsc/server`. All options are required;
`root` is the application directory. Deploy its `.ersc/`, `public/`, and runtime dependencies.

The Promise resolves when ready; startup failures reject and exit. ERSC owns signal handling
and cleanup, so do not wrap it in `BunRuntime.runMain`.

### Deployment adapters

`ersc build --adapter <package>` runs an installed adapter after compilation; it does not upload.
Without the flag, packaging is skipped and previous output remains.

Adapters export `build: BuildHook` from `./build`, with types from `effective-rsc/build`.
The hook receives absolute `root`, `serverDir`, `clientDir`, and `publicDir` paths and returns
`Effect<void, Error, Scope>`. Inputs are read-only; adapters provide dependencies and ERSC owns
cleanup/cancellation. Failures stop the build.

<!-- source-navigation -->

- [Deploying to Vercel](../../02-guides/06-deploying-to-vercel/index.md)
