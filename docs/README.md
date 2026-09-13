# effective-rsc documentation

Contributor documentation for framework behavior, constraints, and unresolved design work. Read this
index and the owning document before planning or changing behavior.

Application authors should use the [public docs](../packages/effective-rsc/docs/index.md). Public
guides explain tasks and observable behavior; API pages define signatures and constraints. Keep
compiler mechanics, protocols, state machines, and design rationale here. Package and example
READMEs own their local setup and operational notes.

Edit public documentation under `packages/effective-rsc/docs`, then run `bun run docs:generate`.
Its examples are type-checked; `LLMS.md` and the documentation site consume the same sources. Do not
hand-edit generated output. Keep relative public-doc links below `<!-- source-navigation -->` so
`LLMS.md` can generate its own links. Preserve page paths and decision/question IDs when reorganizing.

## Status

- **Accepted**: the umbrella for a settled decision, regardless of delivery state.
- **Current**: implemented and authoritative.
- **Planned**: accepted but not implemented.
- **Deferred**: intentionally outside the current milestone.
- **Open**: unresolved; do not choose silently.

## Owners

- [VISION.md](VISION.md): purpose, principles, and non-goals.
- [ARCHITECTURE.md](ARCHITECTURE.md): authoritative architecture overview and limitations.
  - [Build and runtime graphs](architecture/build.md)
  - [Authoring and route model](architecture/authoring.md)
  - [Request flows](architecture/request-flows.md)
  - [Lifetimes, failures, and protocols](architecture/lifetimes-and-protocols.md)
  - [Client-router lifecycle](architecture/client-router.md)
- [DECISIONS.md](DECISIONS.md): Accepted choices grouped by delivery state.
- [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md): open and explicitly deferred questions with their evidence.

Only these files own framework behavior. Preserve historical investigation in Git history rather than
as active agent context.
