## Dependencies

- No `devDependencies`. Put a dependency version in the root catalog only when at least two package
  manifests reference it, counting the workspace root; dependencies used by only one manifest
  declare their version locally.
- Workspace packages reference shared catalog versions with `catalog:`.
- `apps/mobile` must pin Expo's `react`, `react-native`, and `@types/react` versions.

## References

- `repos/` contains read-only references. Never edit or import from them; prefer them over web
  sources.
- Read `repos/effect/LLMS.md` before writing Effect code.

## Code

- Import features from `@repo/<pkg>/modules/<feature>`, never package roots. Use direct-file exports
  for single-file modules and barrels only for real aggregates.
- Match feature-folder casing to its files: use PascalCase in server, contracts, and client-runtime
  modules (for example, `modules/Todo`), and lowercase or kebab-case in web and mobile modules.
- React Compiler is enabled; avoid manual memoization without measured need.
- Use `<package>/<module-name>/<file>` Effect service keys (for example,
  `@repo/server/Todo/TodoService`); never include source-container names such as `src`, `modules`, or
  `lib`. Use `*Layer` layer names and `layerTest` for reusable fakes. Use `Effect.fn` for public
  operations implemented as `(params) => Effect.gen(...)` and `Effect.fnUntraced` for internal
  operations with that shape. Prefer direct effects and pipe combinators for simpler operations,
  adding `Effect.withSpan` when a composed operation is publicly exposed.
- Keep RPC handlers transport-only: adapt validated payloads and delegate. Services own use-case
  semantics, contract decoding, and persistence-error translation. Repositories own database calls
  and return projections plus `Option`/booleans for expected absence; they do not construct RPC
  errors or log failures.
- Keep every atom seeded through `RegistryProvider`'s `initialValues` under `Atom.keepAlive`, and say
  why at the declaration.

## Verify

- Run `bun run check`, `bun run test`, and `bun run build` from the repository root outside managed
  filesystem or seccomp sandboxes.
- Keep testable server modules runtime-independent and run their tests with Vitest directly;
  production builds validate the Bun-specific entry points.
