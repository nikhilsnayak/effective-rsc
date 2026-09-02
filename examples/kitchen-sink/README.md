# Kitchen sink — effective-rsc Conf

The primary effective-rsc example and the repository's end-to-end integration fixture. It is a
two-day conference programme with a personal agenda.

## Run it

```sh
bun run dev
```

Open `http://localhost:18193`. `bun run build` then `bun run start` runs the production build.

Agenda membership uses an in-memory Bun SQLite database initialized by the SQL migration. It begins
empty whenever the server starts.

## Test it

```sh
bun run test      # Vitest: calendar formatting, repository, service
bun run test:e2e  # Playwright: routing, Flight, navigation, Server Functions, assets, HTTP
```

`test:e2e` builds first, then runs every spec twice: once against `ersc start` on port 18194 and
once against `ersc dev` on port 18195. Playwright owns both E2E ports, so the normal development
server can keep running on port 18193. A spec that only makes sense in one mode skips on
`testInfo.project.name`.

## What it exercises

| Framework concern               | Where                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Application composition         | `src/application.tsx`                                                                                   |
| Root Layout owning the document | `src/modules/conference/components/conference-shell.tsx`                                                |
| Static and parameterized Pages  | `src/modules/conference/components/conference-home.tsx`, `src/modules/schedule/components/schedule.tsx` |
| Nested Routes, Loading, mounts  | `src/modules/schedule/routes.tsx`                                                                       |
| Scoped middleware and redirect  | `src/modules/schedule/routes.tsx`                                                                       |
| Server Functions                | `src/modules/agenda/server-functions.ts`                                                                |
| Client Components               | `src/modules/agenda/components/agenda-toggle.tsx`                                                       |
| Userland Effect HTTP            | `src/modules/agenda/http.ts` (`GET /agenda/calendar.ics`)                                               |
| Services and layers             | `src/modules/conference/{service,repository}.ts`                                                        |
| Effect SQL and Bun SQLite       | `src/persistence/`                                                                                      |
| Tailwind v4 through Rspack      | `src/styles.css`                                                                                        |

`src/ersc.ts` declares the service universe once; application values come from one ERSC identity
and its derived middleware views.
