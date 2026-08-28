# effective-rsc application

An effective-rsc application.

## Requirements

- Bun 1.4 or newer
- A browser with the Navigation API and `NavigationPrecommitController`

## Develop

```sh
bun run check
bun run build
bun run start
```

Open `http://localhost:18193`.

For deployment, `ersc start` accepts `--hostname` and `--port`. Command-line flags take precedence
over `HOST` and `PORT`.

The starter application lives in `src/application.tsx`. Its Tailwind stylesheet is
`src/styles.css`.

Framework documentation is installed at `node_modules/effective-rsc/docs`; the combined reference
is `node_modules/effective-rsc/LLMS.md`.
