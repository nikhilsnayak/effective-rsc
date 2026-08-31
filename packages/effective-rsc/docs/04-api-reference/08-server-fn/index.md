## ServerFn

`ERSC.ServerFn.make({ input, handler })` creates a native React Server Function reference. `input`
decodes the invocation payload and infers the handler parameter; do not annotate it. The handler
returns an Effect whose requirements fit the ERSC service universe. The client reference accepts the
Schema's encoded type and resolves `Promise<Output>`; the handler receives its decoded type.

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

Direct server invocation throws. Encode expected failure in a discriminated output union; unexpected
failures reject the Promise. Browser requests require an Origin matching the application host and
may contain at most 10 MiB. See the
[known limitations](https://github.com/nikhilsnayak/effective-rsc/blob/main/docs/ARCHITECTURE.md#known-limitations)
for the typed failure channel and progressive bound arguments.

<!-- source-navigation -->

### Related

- [Middleware](../06-middleware/index.md)
