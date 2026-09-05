## Server Functions

`ERSC.ServerFn.make` decodes Schema input and runs an Effect handler with application services.

Callers pass the Schema's encoded type and the handler receives its decoded type. Use an ordinary
`Schema.Struct(...)` for object input. Use `Schema.fromFormData(...)` when a native form supplies the
input; a function returning `void` can then be passed directly to `<form action>`. Let the Schema
infer the handler parameter.

For form feedback with `useActionState`, use `input: [StateSchema, FormSchema]` and
`handler: (previousState, form) => ...`. React supplies both arguments; ERSC validates and decodes
each one. Keep the native Server Function reference intact when passing it to `useActionState`
to retain progressive enhancement. A single Array or Tuple Schema still describes one argument.

A successful invocation refreshes the current route.

<!-- source-navigation -->

### Examples

- [Create the ERSC identity](./10_ersc.ts)
- [Define a Server Function](./20_follow-author.ts)
- [Use a direct form action](./30_follow-author-button.tsx)
- [Compose the application](./40_application.tsx)
- [Define a stateful form action](./50_greet.ts)
- [Render a stateful form](./60_greeting-form.tsx)
