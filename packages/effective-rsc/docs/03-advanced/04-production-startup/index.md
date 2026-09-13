## Production startup

Run `ersc build`, then `ersc start`. Deploy `.ersc/`, `public/`, and runtime dependencies with
Bun 1.4 or newer. Flags `--hostname` and `--port` override `HOST` and `PORT`; defaults are
`localhost` and `18193`.

For a custom Bun entry, await `start({ root, hostname, port })` from `effective-rsc/server`.
All options are required; `root` is the application directory. The Promise resolves when ready.
Startup failures reject and exit. ERSC handles signals and cleanup; do not wrap it in
`BunRuntime.runMain`.

### Deployment adapters

`ersc build --adapter <package>` packages the build using an installed adapter. It does not upload;
follow the deployment provider's setup. Omitting `--adapter` skips packaging and leaves any previous
adapter output in place.

Adapter authors can use the [framework build contract](https://github.com/nikhilsnayak/effective-rsc/blob/main/docs/architecture/build.md#deployment-adapters).

<!-- source-navigation -->

- [Deploying to Vercel](../../02-guides/06-deploying-to-vercel/index.md)
