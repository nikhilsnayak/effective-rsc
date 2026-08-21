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
- [ARCHITECTURE.md](ARCHITECTURE.md): runtime flow, application model, and module-graph boundaries.
- [DECISIONS.md](DECISIONS.md): compact register of accepted and deferred decisions.
- [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md): choices that need evidence from implementation.
