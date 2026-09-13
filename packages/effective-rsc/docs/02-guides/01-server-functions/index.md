## Server Functions

Export `ERSC.ServerFn.make({ input, handler })` from a module marked `'use server'`. `input` is a
Schema; `handler` returns an Effect and can use application services. Callers pass the Schema's
encoded type, and the handler receives its decoded type. Let the Schema infer handler parameters.

### Forms and mutations

Use `Schema.fromFormData(...)` for form input and return `void` to pass a function directly to
`<form action>`. For feedback with `useActionState`, declare
`input: [StateSchema, FormSchema]` and `handler: (previousState, form) => ...`.
Pass the native reference to `useActionState` to retain submission without JavaScript.

Direct browser calls and form actions refresh the current route after execution. The result can
arrive before suspended content in that refresh finishes.

### Queries and streams

Import `ServerFn` from `effective-rsc/client` to query a Server Function or consume its stream.
`ServerFn.query(reference)(...args)` retrieves the function's result as an Effect;
`ServerFn.queryAtom(reference)` exposes it as an atom for `@effect/atom-react`.
The atom helper cancels its previous request when called again.

Return an Effect `Stream` from the server handler to send chunks as they become available.
Read it with `ServerFn.stream(reference)` or display its latest chunk with
`ServerFn.streamAtom(reference)`. Both expose chunks as they arrive, so client code can process or
display an ongoing result.

### Outcomes and failures

Return expected outcomes, such as unavailable data or a declined operation, as a tagged success
value. The handler and any returned Stream must have a `never` error channel.
Framework failures reject direct-call Promises; the client helpers expose `ServerFnError` in their
Effect or Stream error channel. Use `Effect.catchTag` or inspect an atom's `AsyncResult` cause.

<!-- source-navigation -->

### Examples

- [Create the ERSC identity](./10_ersc.ts)
- [Define a Server Function](./20_follow-author.ts)
- [Use a direct form action](./30_follow-author-button.tsx)
- [Compose the application](./40_application.tsx)
- [Define a stateful form action](./50_greet.ts)
- [Render a stateful form](./60_greeting-form.tsx)

- [Return an expected outcome](./70_lookup-author.ts)
- [Read a query from a Client Component](./80_author-preview.tsx)

### Related

- [ServerFn reference](../../04-api-reference/08-server-fn/index.md)
- [Client query and stream helpers](../../04-api-reference/09-client-queries-and-streams/index.md)
- [Results and route refresh](../../03-advanced/03-server-function-execution-and-refresh/index.md)
