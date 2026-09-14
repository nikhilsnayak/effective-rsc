# Streaming feed

An infinite-scrolling feed of 10,000 fictional notes, demonstrating streamed Server Components.
The first six cards render on the server. Scrolling loads subsequent pages one card at a time,
preserving interactive card state. Failed requests can be retried without losing received cards.
Each card’s full note loads in an Effectful Server Component behind its own Suspense boundary.
Open a note while it loads to see the fallback; view transitions animate opening, closing, and reveal.
An interrupted or failed note stays contained within its card and offers a feed reload.

## Run

```sh
cd examples/streaming-feed
bun run dev
```

Open `http://localhost:18220`. For a production build:

```sh
bun run build
bun run start --port 18220
```

Random delays of 1–3 seconds per card make streaming visible. Set `STREAMING_FEED_DELAY_MS=0` for full speed
or another nonnegative number for a fixed delay.
Notes load separately with a 2–4 second delay, configurable through `STREAMING_FEED_DETAIL_DELAY_MS`.

## Data

The application opens the included [SQLite fixture](data/feed.sqlite) read-only. Each page uses the
last received story ID to retrieve up to six records through an indexed query, reading rows
incrementally. Keep the `data` directory with the application when copying it elsewhere.
Each card also looks up its full note by ID on the server, whether expanded or collapsed.

The notes are synthetic. Offscreen cards use `content-visibility: auto` to reduce rendering work
while retaining their DOM and interactive state. Reloading starts from the first page. JavaScript
is required to load more cards and expand notes.

## Tests

```sh
bun run test
bun run test:e2e
```

Browser tests use production and development servers on ports 18221 and 18222. They cover hydration,
streamed cards, retained client state, retry, and cancellation. Unit tests cover pagination, database
resource cleanup, and atom state.
