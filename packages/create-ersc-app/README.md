# create-ersc-app

Scaffold an effective-rsc application with Bun.

## Requirements

- Bun 1.4 or newer

## Create an application

```sh
bunx create-ersc-app my-application
cd my-application
bun run dev
```

Open `http://localhost:18193`.

The command creates a strict TypeScript application, imports Tailwind from `src/styles.css`, and
installs the exact Effect, React Canary, and RSDR versions compatible with its effective-rsc
release.

RSDR currently declares stable React peer ranges, so Bun may label the pinned React Canary as an
incorrect peer dependency. The scaffolded versions are the tested set; the warning is upstream
package metadata.

Pass `--no-install` to write the application without running `bun install`:

```sh
bunx create-ersc-app my-application --no-install
```

Omit the directory for an interactive prompt:

```sh
bunx create-ersc-app
```

Run `bunx create-ersc-app --help` for the complete command help.
