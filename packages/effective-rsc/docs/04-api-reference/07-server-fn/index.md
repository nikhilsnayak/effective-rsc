## ServerFn

`ERSC.ServerFn.make({ input, handler })` creates a Server Function reference. `input` decodes the
invocation payload and automatically infers the `handler` parameter. Do not annotate it. `handler`
returns an Effect whose requirements fit the ERSC service union. The returned client reference
accepts the Schema's encoded type and resolves `Promise<Output>`; the handler receives its decoded
type.

A Server Function created from `ERSC.withMiddleware(middleware)` activates that scope for its POST.
The action scope surrounds execution and the route refresh. Middleware already active for the action
does not run again; the remaining route middleware wraps the refresh.

```ts
const followAuthor = ERSC.ServerFn.make({
  input: Schema.Struct({ authorId: Schema.NonEmptyString }),
  handler: ({ authorId }) => Effect.succeed({ authorId, following: true }),
});
```

Its client reference accepts `{ authorId: string }`.

Schema transformations may use a different encoded type. For a native form, decode `FormData` and
return `void` so React accepts the function directly as `form.action`:

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

Direct server invocation throws. The handler's Effect error type is not part of the client Promise
type. Encode an expected failure in a discriminated `Output` union; unexpected failures reject the
Promise. Browser requests require an Origin matching the application host and may contain at most
10 MiB.
