## Getting started

Create an application with compatible dependencies and Tailwind support:

```sh
bunx create-ersc-app my-application
cd my-application
bun run dev
```

Open `http://localhost:18193`.

In `src/application.tsx`, create one ERSC identity, define a root Layout and Page, compose Routes,
and export `ERSC.make(...)`.

For a production check, run `bun run check`, `bun run build`, and `bun run start`. Both
`ersc dev` and `ersc start` accept `--hostname` and `--port`; flags take precedence over
`HOST` and `PORT`. See the package README for requirements and manual installation.

Files in `public/` are served from `/` with `Cache-Control: public, max-age=0`.

<!-- source-navigation -->

### Examples

- [Minimal application](./01_first-application.tsx)
- [Stylesheet import](./20_styling.tsx)
