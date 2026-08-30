## Server Functions

`ERSC.ServerFn.make` decodes Schema input and runs an Effect handler with application services.

Callers pass the Schema's encoded type and the handler receives its decoded type. Use an ordinary
`Schema.Struct(...)` for object input. Use `Schema.fromFormData(...)` when a native form supplies the
input; a function returning `void` can then be passed directly to `<form action>`. Let the Schema
infer the handler parameter.

A successful invocation refreshes the current route.
