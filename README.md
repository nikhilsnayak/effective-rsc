# effective-rsc

An experimental, highly opinionated React Server Components framework built with React Canary,
Rspack, Effect v4, and TypeScript 7.

effective-rsc asks what an RSC framework could look like if React owned the UI protocol while Effect
owned requests, resources, failures, services, and cancellation.

It deliberately chooses one modern path: filesystem routing, streaming SSR, React Server Functions,
and a Navigation API client router. It targets current React and browser capabilities without legacy
fallbacks or a promise of production stability.

## Status

The framework is at foundation stage. Its direction and hard architectural decisions are recorded;
the first runnable vertical slice is next.

That slice will render `/` and `/slow` through Rspack, Effect HTTP, RSC, and streaming SSR, hydrate
from the embedded Flight response, and use `loading.tsx` during Navigation API transitions.

## Explore

Start with [the vision](docs/VISION.md), then read the [architecture](docs/ARCHITECTURE.md) and
[decision register](docs/DECISIONS.md). The [source references](repos/README.md) collect the upstream
implementations we are studying.
