## ServerFn

`ERSC.ServerFn.make({ input, handler })` creates a native React Server Function reference. `input`
decodes the invocation payload and infers the handler parameter; do not annotate it. The handler
returns an Effect whose requirements fit the ERSC service universe. The client reference accepts the
Schema's encoded type and resolves `Promise<Output>`; the handler receives its decoded type.

For multiple positional arguments, supply a readonly schema list as `input`. Each caller argument
uses its Schema's encoded type; each handler argument uses its decoded type, in the same order.
Inline lists infer their tuple shape without `as const`. Use `input: []` for no arguments.
`input: Schema.Array(...)` and `input: Schema.Tuple(...)` still describe one argument, not a
positional argument list.

```ts
const followAuthor = ERSC.ServerFn.make({
  input: Schema.Struct({ authorId: Schema.NonEmptyString }),
  handler: ({ authorId }) => Effect.succeed({ authorId, following: true }),
});
```

Schema transformations may use a different encoded type. To pass a Server Function directly to
`form.action`, decode `FormData` and return `void`:

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

A ServerFn created from a derived view activates its middleware for the POST. The Middleware
reference defines refresh reach and ordering.

For a `useActionState` form, declare both the previous state and submitted FormData:

```ts
const StateSchema = Schema.Struct({ message: Schema.String });
const FormSchema = Schema.fromFormData(Schema.Struct({ name: Schema.NonEmptyString }));

const greet = ERSC.ServerFn.make({
  input: [StateSchema, FormSchema],
  handler: (_previousState, { name }) => Effect.succeed({ message: `Hello, ${name}` }),
});
```

Pass the native reference directly to `useActionState(greet, { message: '' })` and its returned
action to `<form action>`. React supplies previous state and FormData for hydrated and progressive
submissions. Previous state is client input: validate it, but never trust it for authorization or
authoritative application state. Native `.bind` can prefill leading arguments.

Direct server invocation throws. Encode expected failure in a discriminated output union; unexpected
failures reject the Promise. Browser requests require an Origin matching the application host and
may contain at most 10 MiB. See the
[known limitations](https://github.com/nikhilsnayak/effective-rsc/blob/main/docs/ARCHITECTURE.md#known-limitations)
for the typed failure channel and progressive bound arguments.

<!-- source-navigation -->

### Related

- [Middleware](../06-middleware/index.md)
