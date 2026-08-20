# rsbuild-plugin-rsc

<p>
  <a href="https://npmjs.com/package/rsbuild-plugin-rsc">
   <img src="https://img.shields.io/npm/v/rsbuild-plugin-rsc?style=flat-square&colorA=564341&colorB=EDED91" alt="npm version" />
  </a>
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="license" />
  <a href="https://npmcharts.com/compare/rsbuild-plugin-rsc?minimal=true"><img src="https://img.shields.io/npm/dm/rsbuild-plugin-rsc.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="downloads" /></a>
</p>

This package provides [React Server Components](https://react.dev/reference/rsc/server-components) (RSC) support for Rsbuild.

## Examples

- **[client](./examples/client)** - Client-driven RSC integration
- **[server](./examples/server)** - Full server-rendered application with routing and Server Actions
- **[react-router](./examples/react-router)** - React Router RSC Data Mode
- **[static](./examples/static)** - Static site generation

Each example includes a complete setup with development and production configurations.

## Getting Started

### Create an Rsbuild React Project

First, ensure you have a functional Rsbuild React project. If you are starting from scratch, follow the [Rsbuild - React](https://rsbuild.rs/guide/framework/react) guide.

### Install Dependencies

Install the plugin along with the necessary RSC runtime dependencies for Rspack:

```bash
npm install rsbuild-plugin-rsc react-server-dom-rspack
```

> Note: Server Components require `react` and `react-dom` v19.1.0 or later.

### Basic Configuration

Add the RSC plugin to your `rsbuild.config.js`:

```js
import path from 'node:path';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { Layers, pluginRSC } from 'rsbuild-plugin-rsc';

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginRSC({
      layers: {
        ssr: path.join(import.meta.dirname, './src/framework/entry.ssr.tsx'),
      },
    }),
  ],
  environments: {
    server: {
      source: {
        entry: {
          index: {
            import: './src/framework/entry.rsc.tsx',
            layer: Layers.rsc,
          },
        },
      },
    },
    client: {
      source: {
        entry: {
          index: './src/framework/entry.client.tsx',
        },
      },
    },
  },
});
```

When this plugin is enabled, it configures Rsbuild's `source.include` for the
RSC environments so `swc-loader` also compiles JavaScript modules under
`node_modules`. This is required for RSC directives in dependencies, such as
`"use client"` and `"use server"`, to be processed correctly. Following
Rsbuild's recommendation for compiling all `node_modules`, `core-js` is excluded
from this extra compilation by default.

## Configuration

### environments

- **Type**:

```ts
type PluginRSCOptions = {
  environments?: {
    server?: string;
    client?: string;
  };
  // other options...
};
```

- **Default**: `{ server: 'server', client: 'client' }`

Specify the names of the server and client environments in your Rsbuild configuration.

To build a React Server Components project, Rsbuild requires two environments: one for server-side code and one for client-side code. By default, these are named `server` and `client` respectively. You can customize these names to match your project structure:

```js
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginRSC } from 'rsbuild-plugin-rsc';

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginRSC({
      environments: {
        server: 'node',
        client: 'browser',
      },
      // other options
    }),
  ],
  environments: {
    node: {
      // server environment configuration
    },
    browser: {
      // client environment configuration
    },
  },
});
```

### layers

- **Type**:

```ts
import type { Rspack } from '@rsbuild/core';

type PluginRSCOptions = {
  layers?: {
    rsc?: Rspack.RuleSetCondition;
    ssr?: Rspack.RuleSetCondition;
  };
  // other options...
};
```

- **Default**: `undefined`

Configure module layer rules to distinguish between RSC and SSR runtimes in the server environment.

The plugin uses layers to differentiate between React Server Components runtime and SSR runtime within the `server` environment:

- **`rsc` layer**: Modules matching this rule will use the `react-server` export condition
- **`ssr` layer**: Modules matching this rule will use the default export condition

There are two ways to configure layers:

#### 1. Plugin Options

Define layers directly in the plugin configuration:

```js
import path from 'node:path';
import { pluginRSC } from 'rsbuild-plugin-rsc';

pluginRSC({
  layers: {
    rsc: path.join(import.meta.dirname, './src/framework/entry.rsc.tsx'),
    ssr: path.join(import.meta.dirname, './src/framework/entry.ssr.tsx'),
  },
});
```

#### 2. Environment Entry Configuration

Specify the layer for each entry point in the Rsbuild environment configuration:

```js
import { Layers } from 'rsbuild-plugin-rsc';

export default defineConfig({
  environments: {
    server: {
      source: {
        entry: {
          index: {
            import: './src/framework/entry.rsc.tsx',
            layer: Layers.rsc,
          },
        },
      },
    },
  },
});
```

## Architecture

This plugin is built on top of Rspack's native RSC implementation. For detailed architecture documentation and implementation details, see the [Rspack RSC Documentation](https://v2.rspack.rs/guide/tech/rsc).

## License

MIT
