# effective-rsc documentation

Read this index before changing framework behavior.

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
- [DECISIONS.md](DECISIONS.md): Accepted choices grouped by delivery state.
- [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md): open and explicitly deferred questions with their evidence.

Only these files own framework behavior. Preserve historical investigation in Git history rather than
as active agent context.
