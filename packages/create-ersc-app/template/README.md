# effective-rsc application

Requires Bun 1.4 or newer.

```sh
bun run dev
```

Open `http://localhost:18193`. Edit `src/application.tsx` and its Tailwind stylesheet,
`src/styles.css`. Files in `public/` are served from `/`.

Verify and run production output:

```sh
bun run check
bun run build
bun run start
```

`ersc start --hostname <host> --port <port>` overrides `HOST` and `PORT`.
Client navigation needs the Navigation API and `NavigationPrecommitController`; other browsers
load full documents while hydration and Server Functions still work.

Documentation: `node_modules/effective-rsc/docs`. Combined reference:
`node_modules/effective-rsc/LLMS.md`.
