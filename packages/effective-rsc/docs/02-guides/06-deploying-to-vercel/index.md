### Deploying to Vercel

Deploy to Vercel with Bun 1.4+. Match the adapter version to `effective-rsc`.

```sh
bun add --dev @ersc/vercel
```

Set the build script in `package.json`:

```json
{
  "scripts": {
    "build": "ersc build --adapter @ersc/vercel"
  }
}
```

Commit `bun.lock`, connect your GitHub repository in Vercel, and set:

| Setting          | Value                           |
| ---------------- | ------------------------------- |
| Framework Preset | Other                           |
| Root Directory   | Application directory           |
| Install Command  | `bun install --frozen-lockfile` |
| Build Command    | `bun run --bun build`           |
| Output Directory | Leave the override disabled     |

Add your environment variables and deploy. The adapter generates `.vercel/output/`; no custom
server entry or `vercel.json` is needed.

For [monorepos](https://vercel.com/docs/monorepos/monorepo-faq), enable **Include source files outside
of the Root Directory in the Build Step**. With Turborepo, use
`bun run --bun turbo run build --filter=your-app` to build the app and its workspace dependencies.
