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

The build includes `@ersc/vercel` packaging. To deploy, run `vercel deploy --prebuilt` from the
linked example directory after building.
