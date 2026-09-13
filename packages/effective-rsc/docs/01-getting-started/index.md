## Getting started

Install Bun 1.4 or newer, then create an application with compatible dependencies and Tailwind:

```sh
bunx create-ersc-app my-application
cd my-application
bun run dev
```

Open `http://localhost:18193`. Omit the directory to use the interactive prompt; pass `--no-install`
to install dependencies yourself.

The application entry is `src/application.tsx`. It defines a root Layout containing the HTML
document, attaches Pages to Routes, and exports `ERSC.make(...)`. Other filenames are yours to choose.

### Styles and assets

Import CSS from the module that uses it. The starter's `src/styles.css` includes Tailwind; plain CSS
works too. Imported images, fonts, and media resolve to built asset URLs. Reference
`effective-rsc/types` in `src/environment.d.ts` so TypeScript recognizes these imports.
Files in `public/` are served from `/`.

### Production

```sh
bun run check
bun run build
bun run start
```

Both `ersc dev` and `ersc start` accept `--hostname` and `--port`. Flags override `HOST` and `PORT`;
defaults are `localhost` and `18193`.

<!-- source-navigation -->

### Examples

- [Minimal application](./01_first-application.tsx)
- [Stylesheet import](./20_styling.tsx)

### Related

- [Manual installation](./02-manual-installation/index.md)
- [Production startup](../03-advanced/04-production-startup/index.md)
