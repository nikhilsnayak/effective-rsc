## ServerFn

Export `ERSC.ServerFn.make({ input, handler })` from a `'use server'` module. It creates a native
React Server Function: callers pass encoded Schema values; the Effect handler receives decoded
values and may require application or middleware services. Direct server invocation throws.

### Arguments

| `input`              | Caller and handler arguments      |
| -------------------- | --------------------------------- |
| One Schema           | One argument                      |
| Readonly schema list | One argument per Schema, in order |
| `[]`                 | No arguments                      |

An Array or Tuple Schema describes one argument. Inline schema lists infer tuples without
`as const`; let the Schema infer handler parameters.

```ts
const followAuthor = ERSC.ServerFn.make({
  input: Schema.Struct({ authorId: Schema.NonEmptyString }),
  handler: ({ authorId }) => Effect.succeed({ authorId, following: true }),
});
```

### Forms

To use `<form action>`, decode FormData and return `void`:

```tsx
const followAuthorForm = ERSC.ServerFn.make({
  input: Schema.fromFormData(Schema.Struct({ authorId: Schema.NonEmptyString })),
  handler: ({ authorId }) => Effect.logInfo('Followed author', { authorId }),
});

<form action={followAuthorForm}>
  <input name='authorId' />
  <button type='submit'>Follow</button>
</form>;
```

For `useActionState`, declare previous state and FormData as positional arguments:

```ts
const greet = ERSC.ServerFn.make({
  input: [
    Schema.Struct({ message: Schema.String }),
    Schema.fromFormData(Schema.Struct({ name: Schema.NonEmptyString })),
  ],
  handler: (_previousState, { name }) => Effect.succeed({ message: `Hello, ${name}` }),
});
```

Pass `greet` to `useActionState(greet, { message: '' })`, and its returned action to the form.
Previous state is client input; never use it as authority for authorization or stored application
state. Native `.bind` can prefill leading arguments. Bind on the server when the form must work
without JavaScript; client-created bindings currently do not progressively enhance.

### Outcomes and errors

The handler's Effect error channel must be `never`. Return expected application outcomes in the
success value, for example a tagged union. Client references resolve `Promise<Output>` or reject
with a `ServerFnError`, exported from `effective-rsc/client`:

| Error                    | Meaning                                        | Data                                                        |
| ------------------------ | ---------------------------------------------- | ----------------------------------------------------------- |
| `ServerFnInputError`     | Arguments failed Schema validation             | `detail.message`                                            |
| `ServerFnDefect`         | Unhandled server failure                       | `digest` matching the server log; development error details |
| `ServerFnTransportError` | Encoding, request, or response decoding failed | `detail`, when available                                    |

Production redacts server failure details. Query and stream helpers expose these errors in their
Effect or Stream error channel; atom helpers expose them through `AsyncResult`.

### Streaming output

When the handler returns an Effect `Stream`, the client Promise resolves a `ReadableStream` of its
chunks. Consume it with `ServerFn.stream` or `streamAtom`. A failure during streaming reaches those
helpers as a `ServerFnDefect` when React supplies a server digest; transport failures remain
`ServerFnTransportError`.

```ts
const readTicks = ERSC.ServerFn.make({
  input: Schema.Struct({ count: Schema.Finite }),
  handler: ({ count }) => Effect.succeed(Stream.range(1, count)),
});
```

Every returned Stream must have a `never` error channel and require only available services.
All return alternatives must be Streams or all must be non-stream values. Unions of valid Streams
combine their chunk types; `Stream<A> | null` is rejected. Return `Stream.empty` for no chunks.
A streaming function cannot be a direct form action, which requires `Promise<void>`.

Rate-limit producers: Flight does not apply consumer backpressure, so faster producers can buffer
on the server and client. Cancellation awaits the returned Stream's finalizers before releasing
request resources; see Resources and cancellation.

Functions created from a middleware view activate that middleware for mutations and queries.
Browser requests require an Origin matching the application host and are limited to 10 MiB.

<!-- source-navigation -->

- [Server Functions guide](../../02-guides/01-server-functions/index.md)
- [Client query and stream helpers](../09-client-queries-and-streams/index.md)
- [Resources and cancellation](../../03-advanced/01-request-runtime-and-lifetimes/index.md)
- [Middleware reach](../06-middleware/index.md)
