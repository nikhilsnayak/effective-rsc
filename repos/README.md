# Source references

These directories are read-only references for designing effective-rsc. They are local so the
protocol, bundler integration, and Effect APIs can be studied together without repeatedly searching
remote repositories. Framework packages do not import from them.

| Directory | Shape | Why it is here |
| --- | --- | --- |
| `effect` | Git subtree of the complete repository | Effect v4 APIs, implementation patterns, and tests |
| `react-server-dom-rspack` | Focused source snapshot | The Rspack Flight bindings behind `react-server-dom-rspack@0.1.0` |
| `rspack-rsc` | Focused example snapshot | Rspack's small end-to-end RSC, SSR, Server Function, and HMR example |
| `rsbuild-plugin-rsc` | Complete repository snapshot | Official Rsbuild environment, directive, manifest, and integration behavior |
| `vite-plugin-rsc` | Focused package snapshot | A second bundler implementation with extensive transform and protocol tests |
| `rsc-html-stream` | Complete repository snapshot | The small Flight-payload-to-HTML stream bridge used by multiple implementations |
| `cosmos-rsc` | Complete repository snapshot | The original local first-principles template and its client router |
| `twofold` | Focused packages snapshot | Framework runtime, router, Client Component transforms, and Server Function transforms |
| `waku` | Focused framework snapshot | A mature minimal RSC framework, including Bun, routing, streaming, and SSR paths |

Exact source commits are recorded in `.vendor-lock.json`. The React snapshot is pinned to the commit
used to publish version `0.1.0`; its checked-in manifest still carries React's `19.3.0` source
version, while the npm artifact carries `0.1.0` at that same `gitHead`. Other snapshots follow their
upstream `main` branches and record the resolved commit on every sync.

Update one reference with `bun run vendor:sync <name>`, or update all of them with
`bun run vendor:sync all`. The Effect repository remains a Git subtree. Other references are fetched
through temporary partial clones; monorepos materialize only the source directory named in the
vendor configuration.
