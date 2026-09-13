# effective-rsc documentation

Build Server Components and Server Functions with React, Schema, and Effect. These docs assume
familiarity with React and Effect; start with Getting started for a working application.

Define your application in `src/application.tsx`. Create its Pages, Layouts, Routes, and Server
Functions from one `Application.ersc()` instance, then export `ERSC.make(...)`.

Import authoring APIs from `effective-rsc` in server modules. Client Components use
`effective-rsc/client` for Server Function queries and streams. The package root cannot be imported
by Client Components.

<!-- source-navigation -->

- [Getting started](./01-getting-started/index.md)
- [Guides](./02-guides/index.md)
- [Advanced](./03-advanced/index.md)
- [API reference](./04-api-reference/index.md)
