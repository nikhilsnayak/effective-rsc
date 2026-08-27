# effective-rsc documentation

These docs cover effective-rsc APIs and conventions. Use the React and Effect documentation for
their underlying concepts.

- Only `src/application.tsx` has framework filename semantics.
- Create every authoring value in an application from one ERSC instance.
- Provide application services and export the result at `ERSC.make`.
- Import the package root only from the RSC graph.

Start with Getting started. Use the guides for composition examples and the API reference for exact
contracts.
