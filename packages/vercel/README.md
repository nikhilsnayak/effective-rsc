# @ersc/vercel

Vercel deployment packaging for effective-rsc on Bun 1.4+.

Add `@ersc/vercel` to the app's `devDependencies` and build with:

```sh
ersc build --adapter @ersc/vercel
```

This generates `.vercel/output/` with a Bun function, traced dependencies, and copied assets.
No custom server entry or `vercel.json` is needed. Connect the repository in the Vercel dashboard
with the Other preset. See the [deployment guide](https://effective-rsc.nikhilsnayak.dev/docs/guides/deploying-to-vercel)
for build settings and monorepos.

Public asset symlinks are copied as content, including targets outside the app. Broken or cyclic
links fail packaging. Computed file reads may escape tracing; local databases are not persistent.
Plain `ersc build` skips packaging and leaves previous deployment output untouched.

See the [hello-world example](https://github.com/nikhilsnayak/effective-rsc/tree/main/examples/hello-world).
