## Getting started

Create an application with compatible dependencies and Tailwind support:

```sh
bunx create-ersc-app my-application
```

In `src/application.tsx`, create one ERSC instance, define a root Layout and Page, compose Routes,
and export `ERSC.make(...)`.

Run `bun run check`, `bun run build`, and `bun run start`. The default URL is
`http://localhost:18193`. See the package README for requirements and manual installation.
