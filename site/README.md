# effective-rsc site

Home and documentation, built with ERSC. From the repository root:

```sh
bun install
bun run build --filter=@ersc/site
bun run --cwd site start
```

Open `http://localhost:18215`. Use build/start while [Bun #41523](https://github.com/oven-sh/bun/issues/41523)
affects Markdown rendering in dev. Rebuild and restart after changes.

## Content

The build copies installed package docs, logos, `LLMS.md`, and fonts into `public/generated/`.
The server indexes titles and validates links at startup, then reads each requested document.
Numeric prefixes control ordering; examples are displayed, not executed. Rendering, highlighting,
and shadcn/Base UI controls are site-owned.

## Deployment

Production GET/HEAD page responses with status 200 request one year of Vercel CDN caching.
Browsers revalidate; HTML and Flight stay separate through `Vary: Accept`. Query strings and
deployment identity are part of the cache key. Retention is best-effort: eviction or expiry
can trigger another render. Assets, unmatched routes, and other methods retain their own policy.

Pages must remain public and request-independent. The site has no Server Functions; preferences
are browser-only. This is interim response caching, not SSG. Late errors inside HTTP 200 React
streams can be cached. Check HTML/Flight responses and `x-vercel-cache` MISS/HIT before promotion;
local tests do not verify CDN behavior. Open browser route trees survive deployments.

See Vercel's [cache rules](https://vercel.com/docs/caching/cdn-cache),
[cache keys](https://vercel.com/docs/caching/cdn-cache/purge#cache-keys), and
[header precedence](https://vercel.com/docs/caching/cache-control-headers).
