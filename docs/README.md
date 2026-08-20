# effective-rsc documentation

These documents own framework direction, accepted decisions, and unresolved design work. Read them
before changing framework behavior.

## Status language

- **Accepted**: explicitly agreed and safe to implement.
- **Working**: the current design to validate in the next vertical slice.
- **Open**: unresolved; implementation must not silently choose an answer.
- **Deferred**: intentionally outside the current milestone.

Each decision has one owning document. Other documents should link to it rather than restating a
different version.

## Documents

- [VISION.md](VISION.md): purpose, principles, and non-goals.
- [ARCHITECTURE.md](ARCHITECTURE.md): runtime flow, authoring model, and planned package boundaries.
- [DECISIONS.md](DECISIONS.md): compact register of accepted and deferred decisions.
- [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md): choices that need evidence from implementation.

## Current phase

The repository is at foundation stage. The application starter has been removed while retaining the
Bun, Turbo, TypeScript, Effect tooling, linting, formatting, testing, CI, and vendored-reference
workflow used across the author's other projects.

The next milestone is one end-to-end vertical slice: `/` and `/slow`, compiled by Rspack, served by
Effect HTTP, streamed through RSC and SSR, hydrated without an extra initial request, and navigated
through the Navigation API with `loading.tsx`.
