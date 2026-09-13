## Query

`effective-rsc/client` exports `ServerFn` for reading a Server Function from a Client Component.
Pass the Server Function reference itself to `<form action>` and `useActionState`; those are not
queries.

`ServerFn.query(serverFn)` returns a function taking the encoded arguments and yielding an Effect.
`ServerFn.queryAtom(serverFn)` returns an `Atom.AtomResultFn` for `@effect/atom-react`. Both abort
the request when the caller is interrupted; new atom arguments supersede an in-flight read, and
`Atom.Interrupt` cancels one.

Both fail with `ServerFnError`, the union of the three framework failures, read from the
`AsyncResult` cause. Queries never refresh the route.

`ServerFn.stream(serverFn)` reads a Server Function whose handler returns a `Stream`, yielding a
`Stream` whose scope owns the request; `ServerFn.streamAtom` exposes the latest chunk as its
`AsyncResult`, and `Atom.pull` accumulates chunks instead. Passing a streaming Server Function to
`query` is a type error naming `stream`, and the reverse is too.

Provide one `RegistryProvider` in the root Layout and seed atoms with `useAtomInitialValues`. A
nested provider replaces the registry for its subtree.
