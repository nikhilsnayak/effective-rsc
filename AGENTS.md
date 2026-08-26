## Dependencies

- Put a dependency version in the root catalog only when at least two package manifests reference
  it, counting the workspace root; dependencies used by only one manifest declare their version
  locally.
- Workspace packages reference shared catalog versions with `catalog:`.
- Pin React Canary, React DOM Canary, and `react-server-dom-rspack` to one exact compatible release.

## References

- Read `docs/README.md` and the relevant owning documents before planning or changing framework
  behavior. Do not contradict an Accepted decision or silently resolve an Open question; surface
  the conflict instead.
- `repos/` contains read-only references. Never edit or import from them; prefer them over web
  sources.
- Read `repos/effect/LLMS.md` before writing Effect code.

## Code

- Keep browser, RSC, SSR, and shared module graphs explicit. Code for one runtime must not depend on
  another runtime's entry point or ambient globals.
- Export deliberate public subpaths from package manifests; do not expose package roots as broad
  barrels. Use direct-file exports for single-file modules and barrels only for real aggregates.
- Use path-qualified Effect service identifiers and `layerTest` for reusable fakes. A service owns
  `static readonly layer` when its contract and implementation share a runtime graph; a contract
  shared across runtime graphs stays implementation-free and its owning runtime exports a `*Layer`.
  Use `Effect.fn` for public operations implemented as `(params) => Effect.gen(...)` and
  `Effect.fnUntraced` for internal operations with that shape.
- Propagate request and navigation cancellation through Effect interruption and Web Streams. Do not
  detach work from its request scope without an explicit lifetime owner.
- Throw a plain `TypeError` for programmer error: a contract that only a wiring mistake can violate,
  such as a value from another ERSC module or a concern rendered outside its request runtime. Model
  anything reachable from request input, I/O, or application code as a typed Effect failure. A throw
  that request data can trigger is a bug in the boundary, not a style choice.
- Preserve React's native RSC and Server Function protocols. Framework APIs may add Effect typing,
  validation, and lifecycle management but must not invent replacement transports.
- Generated framework artifacts live under `.ersc/`; never hand-edit or import them across
  package boundaries except through their documented generated entry points.

## Verify

- Run `bun run check`, `bun run test`, and `bun run build` from the repository root outside managed
  filesystem or seccomp sandboxes.
- Keep protocol and compiler tests runtime-independent where possible. Integration tests own the
  boundaries between Rspack compilation, RSC rendering, SSR, hydration, and browser navigation.
