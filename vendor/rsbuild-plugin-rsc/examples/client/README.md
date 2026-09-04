# Rsbuild RSC Client Driven Example

This example is adapted from the Parcel RSC example to demonstrate how to use [Rsbuild](https://github.com/web-infra-dev/rsbuild) for React Server Components (RSC) in a client-driven React app. It shows how you can integrate server components into an existing client-rendered application using Rsbuild as the build tool.

## Setup

The example consists of the following main files:

### client/index.tsx

This is a typical entry file for a client-rendered React app. It calls `createRoot` and renders an `<App />` into the DOM.

### client/App.tsx

This is the root component of the client app. It renders some client components as normal, and uses `<Suspense>` to load a React Server Component.

A small fetch wrapper loads an RSC payload from the server. Returning this promise from a component causes React to suspend. Once the server component loads, it renders.

### server/server.mjs

This is the server entrypoint, built using Express. In its route handler, it creates an RSC payload using Rsbuild's RSC support. This renders to the RSC payload format, not to HTML, since the client app will be consuming it via fetch and not on initial page load.

### server/RSC.tsx

This is a server component. Since it is not rendering a full page, it does not render the `<html>` element, just the embedded content. It is marked with the `"use server-entry"` directive, which creates a code splitting entrypoint. Common dependencies between entries are extracted into shared bundles.
