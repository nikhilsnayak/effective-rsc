## ServerFn

`ERSC.ServerFn.make({ input, handler })` creates a Server Function reference. `input` decodes the
invocation payload and automatically infers the `handler` parameter. Do not annotate it. `handler`
returns an Effect whose requirements fit the ERSC service union. The returned client reference
accepts the same inferred input type and resolves `Promise<Output>`.

```ts
const Input = Schema.Struct({ authorId: Schema.NonEmptyString });

const followAuthor = ERSC.ServerFn.make({
  input: Input,
  handler: (input) => Effect.succeed(input.authorId),
});
```

Direct server invocation throws. The handler's Effect error type is not part of the client Promise
type. Encode an expected failure in a discriminated `Output` union; unexpected failures reject the
Promise. Browser requests require an Origin matching the application host and may contain at most
10 MiB.
