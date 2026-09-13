## Manual installation

Create a Bun package and install the framework with its exact compatible peers:

```sh
mkdir my-effective-rsc-app
cd my-effective-rsc-app
bun init -y
bun add effective-rsc@0.1.4 \
  effect@4.0.0-rc.113 \
  @effect/platform-browser@4.0.0-rc.113 \
  @effect/platform-bun@4.0.0-rc.113 \
  react@19.3.0-canary-1d34f91d-20260909 \
  react-dom@19.3.0-canary-1d34f91d-20260909 \
  react-server-dom-rspack@0.1.0
bun add --dev \
  typescript@7.0.2 \
  @types/bun@^1.4.2 \
  @types/react@19.3.0 \
  @types/react-dom@19.3.0
```

Add the framework commands to `package.json`:

```json
{
  "type": "module",
  "scripts": {
    "dev": "ersc dev",
    "check": "tsc --noEmit",
    "build": "ersc build",
    "start": "ersc start"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "noEmit": true,
    "strict": true,
    "erasableSyntaxOnly": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noUncheckedSideEffectImports": true,
    "types": ["bun", "react", "react-dom", "react/canary"],
    "lib": ["ESNext", "DOM", "DOM.Iterable"]
  },
  "include": ["src"]
}
```

Create `src/environment.d.ts` so TypeScript accepts stylesheet and asset imports:

```ts
/// <reference types="effective-rsc/types" />
```

Create `src/application.tsx` using the minimal application example, then run `bun run dev`.
To add Tailwind, install `tailwindcss@4.3.3` as a dev dependency and put
`@import 'tailwindcss';` in an imported stylesheet.

Keep the framework and its peers on a compatible release set when upgrading; the scaffold template
ships that set together.

<!-- source-navigation -->

- [Minimal application](../01_first-application.tsx)
- [Getting started](../index.md)
