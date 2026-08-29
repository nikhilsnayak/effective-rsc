# effective-rsc documentation

Use the React and Effect documentation for their underlying concepts. ERSC conventions:

- Only `src/application.tsx` has framework filename semantics.
- Create every authoring value in an application from one ERSC instance.
- Provide application services and export the result at `ERSC.make`.
- Import the package root only from the RSC graph.

Start with Getting started, then use Guides for composition, Advanced for runtime behavior, and API
reference for exact contracts.
