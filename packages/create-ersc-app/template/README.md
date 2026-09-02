# effective-rsc application

A new effective-rsc application.

## Requirements

- Bun 1.4 or newer

Hydration and client navigation require the Navigation API and `NavigationPrecommitController`.
Other browsers use the server-rendered application as a multi-page application, with working links
and native form submissions.

## Develop

```sh
bun run dev
```

Open `http://localhost:18193`.

Verify and run the production build with:

```sh
bun run check
bun run build
bun run start
```

For deployment, `ersc start` accepts `--hostname` and `--port`. Command-line flags take precedence
over `HOST` and `PORT`.

The starter application lives in `src/application.tsx`. Its Tailwind stylesheet is
`src/styles.css`. Files in `public/` are served from `/`.

Framework documentation is installed at `node_modules/effective-rsc/docs`; the combined reference
is `node_modules/effective-rsc/LLMS.md`.
