# Rsbuild RSC Client Driven Example

This example is adapted from the Parcel RSC example to demonstrate how to use [Rsbuild](https://github.com/web-infra-dev/rsbuild) for React Server Components (RSC) in a client-driven React app. It shows how you can integrate server components into an existing client-rendered application using Rsbuild as the build tool.

## Setup

The example consists of the following main files:

### client/index.tsx

This is a typical entry file for a client-rendered React app. It calls `createRoot` and renders an `<App />` into the DOM.

### client/App.tsx

This is the root component of the client app. It renders some client components as normal, and uses `<Suspense>` to load a React Server Component.

A small fetch wrapper loads an RSC payload from the server. Returning this promise from a component causes React to suspend. Once the server component loads, it renders.

### server/index.tsx

Renders an `<RSC />` component server side and serves it as an RSC payload to be `fetch`ed by `client/App.tsx`.

This runs both as part of the dev server (see `rsbuild.config.ts`, under `server.setup`), and as part of `server.js`
(see below).

### `server.js`

An express server that serves (`npm run preview`) both:

- the RSC handler from `server/index.tsx`
- and the built files in `dist/`

### server/RSC.tsx

This is a server component. Since it is not rendering a full page, it does not render the `<html>` element, just the embedded content. It is marked with the `"use server-entry"` directive, which creates a code splitting entrypoint. Common dependencies between entries are extracted into shared bundles.
