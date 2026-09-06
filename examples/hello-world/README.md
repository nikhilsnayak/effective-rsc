# Hello world

Two routes, streaming, a client counter, and a Server Function form.

From the repository root:

```sh
bun install --frozen-lockfile
bun run build --filter=@effective-rsc/example-hello-world
bun run --cwd examples/hello-world dev
```

Open `http://localhost:18214`. For production, stop dev and run
`bun run --cwd examples/hello-world start`. Its `server.ts` uses `effective-rsc/server`.

Client navigation preserves the layout counter; full-page loads reset it. The greeting form also
works without JavaScript. Browser coverage lives in the framework fixture.

The build includes `@ersc/vercel` packaging. Follow the
[deployment guide](../../packages/effective-rsc/docs/02-guides/06-deploying-to-vercel/index.md)
with `examples/hello-world` as the Root Directory and
`bun run --bun turbo run build --filter=@effective-rsc/example-hello-world` as the Build Command.
