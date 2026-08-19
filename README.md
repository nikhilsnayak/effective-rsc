# Turborepo Effect Starter

A Bun/Turborepo starter with an Effect server, shared RPC contracts and client runtime, React web
app, Expo mobile app, and shared UI package.

## Create from the template

1. Create a GitHub repository from this template and clone it. GitHub creates the new repository's
   initial commit before any vendored reference is added.
2. Install dependencies with `bun install`.
3. From a clean, committed working tree, run `bun run vendor:sync effect`. The first run creates a
   squashed `git subtree add`; later runs create squashed subtree pulls.
4. Copy each workspace's `.env.example` to `.env`. When using a physical mobile device, replace
   `localhost` in `apps/mobile/.env` with your computer's LAN address.
5. Start PostgreSQL with `docker compose -f apps/server/docker-compose.yml up -d`, then run
   `bun run --cwd apps/server db:migrate`.
6. Start the workspaces with `bun run dev`.

For the Expo web target, run `bun run --cwd apps/mobile web`. The root build exports that target as
static files, so both web clients are covered by `bun run build`.

The files under `repos/` are read-only source references. Application code must use package
dependencies and never import from a vendored repository.

## Verification

Run the complete root workflow:

```sh
bun run check
bun run test
bun run build
```

Tests use Vitest and `@effect/vitest`, live beside the behavior they protect, and favor observable
results and typed Effect test layers over module mocks.
