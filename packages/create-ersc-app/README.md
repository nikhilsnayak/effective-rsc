# create-ersc-app

Create an effective-rsc application with Bun 1.4 or newer:

```sh
bunx create-ersc-app my-application
cd my-application
bun run dev
```

Open `http://localhost:18193`. The scaffold includes strict TypeScript, Tailwind in `src/styles.css`,
and the exact Effect, React Canary, and `react-server-dom-rspack` versions tested with its framework
release. Bun may report a React peer warning because `react-server-dom-rspack` declares stable peer
ranges; retain the scaffolded compatible versions.

Omit the directory for an interactive prompt. Pass `--no-install` to create files without running
`bun install`, or `--help` for all options.

[Application documentation](https://effective-rsc.nikhilsnayak.dev/docs/getting-started) also ships in
`node_modules/effective-rsc/docs`, with a combined `node_modules/effective-rsc/LLMS.md` reference.
