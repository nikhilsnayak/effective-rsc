# Rsbuild RSC React Router Example

This example shows how to run React Router's experimental RSC Data Mode on top
of `rsbuild-plugin-rsc`.

## What It Demonstrates

- React Router RSC request handling with `unstable_matchRSCServerRequest`
- HTML rendering with `unstable_RSCStaticRouter` plus a custom Rsbuild SSR
  adapter that injects the React Router flight stream
- Browser hydration with `unstable_RSCHydratedRouter`
- React Server Actions over `react-server-dom-rspack`
- Client-side navigation managed by React Router, while `rsbuild-plugin-rsc`
  still provides the RSC build layers and the `rsc:update` dev signal
