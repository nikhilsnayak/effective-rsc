# effective-rsc framework E2E fixture

The repository's framework-oriented integration fixture. This is deliberately not a product
example: its neutral catalog, selection state, artificial latency, and stable labels exist only to
make framework behavior observable and assertable.

Use [`examples/event-platform`](../../examples/event-platform) for a realistic application.

## Run it

```sh
bun run dev
```

Open `http://localhost:18193`. `bun run build` then `bun run start` runs the production build.
Selection state uses an in-memory Bun SQLite database initialized with two selected fixture items
whenever the server starts.

## Test it

```sh
bun run test      # focused formatter, repository, and service tests
bun run test:e2e  # authoritative framework protocol and lifecycle verification
```

`test:e2e` runs every spec against both `ersc start` on port 18194 and `ersc dev` on port 18195.
The suite is intentionally expensive; prefer focused checks while iterating and run it as the
authoritative verification step after a coherent framework change.

## Concern map

| Framework concern                  | Fixture owner                                                    |
| ---------------------------------- | ---------------------------------------------------------------- |
| Application composition            | `src/application.tsx`                                            |
| Root Layout and full document      | `src/modules/fixture/components/fixture-shell.tsx`               |
| Static and parameterized Pages     | `fixture-home.tsx`, `catalog.tsx`                                |
| Nested Routes, Loading, and mounts | `src/modules/catalog/routes.tsx`                                 |
| Scoped middleware and redirects    | `src/modules/fixture/actor.ts`, `src/modules/catalog/routes.tsx` |
| Server Functions                   | `src/modules/selection/server-functions.ts`                      |
| Client Components                  | `src/modules/selection/components/selection-toggle.tsx`          |
| Userland Effect HTTP               | `src/modules/selection/http.ts` (`GET /selection/export.csv`)    |
| Services and layers                | `src/modules/fixture/{service,repository}.ts`                    |
| Effect SQL and Bun SQLite          | `src/persistence/`                                               |
| Tailwind v4 through Rspack         | `src/styles.css`                                                 |

`src/ersc.ts` declares the service universe once. Application concerns come from that one ERSC
identity and its derived middleware views.
