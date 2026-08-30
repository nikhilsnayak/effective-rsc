# Kitchen sink — effective-rsc Conf

The primary effective-rsc example and the repository's end-to-end integration fixture. It is a
two-day conference programme with a persisted personal agenda.

## Run it

```sh
bun run dev
```

Open `http://localhost:18193`. `bun run build` then `bun run start` runs the production build.

Agenda membership is stored in `.data/conference.sqlite`, created by the SQL migration on first
start. Set `CONFERENCE_DATABASE_PATH` to move it; the Playwright run sets `:memory:` so each run
begins empty.

## Test it

```sh
bun run test      # Vitest: calendar formatting, repository, service
bun run test:e2e  # Playwright: routing, Flight, navigation, Server Functions, assets, HTTP
```

`test:e2e` builds first, then runs every spec twice: once against `ersc start` on port 18193 and
once against `ersc dev` on port 18194. Both servers are started by Playwright, so stop your own
`ersc dev` before running it. A spec that only makes sense in one mode skips on
`testInfo.project.name`.

## What it exercises

| Framework concern               | Where                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Application composition         | `src/application.tsx`                                                                                   |
| Root Layout owning the document | `src/modules/conference/components/conference-shell.tsx`                                                |
| Static and parameterized Pages  | `src/modules/conference/components/conference-home.tsx`, `src/modules/schedule/components/schedule.tsx` |
| Nested Routes, Loading, mounts  | `src/modules/schedule/routes.tsx`                                                                       |
| Routes middleware and redirect  | `src/modules/schedule/routes.tsx`                                                                       |
| Server Functions                | `src/modules/agenda/server-functions.ts`                                                                |
| Client Components               | `src/modules/agenda/components/agenda-toggle.tsx`                                                       |
| Userland Effect HTTP            | `src/modules/agenda/http.ts` (`GET /agenda/calendar.ics`)                                               |
| Services and layers             | `src/modules/conference/{service,repository}.ts`                                                        |
| Bun SQLite persistence          | `src/persistence/`                                                                                      |
| Tailwind v4 through Rspack      | `src/styles.css`                                                                                        |

`src/ersc.ts` declares the service universe once; every authoring value in the application comes
from that one instance.
