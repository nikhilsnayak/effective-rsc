import type { Rspack } from '@rsbuild/core';

export type PluginRSCOptions = {
  /**
   * Configuration for customizing Rsbuild environment names.
   * Use this if you want to rename the default 'server' or 'client' environments
   * to avoid conflicts or match your project's naming convention.
   */
  environments?: {
    /**
     * The name of the environment for React Server Components (Server Bundle).
     * This environment compiles the server-side logic (RSC, Server Actions).
     * @default 'server'
     */
    server?: string;

    /**
     * The name of the environment for Client Components (Browser Bundle).
     * This environment compiles the assets served to the browser.
     * @default 'client'
     */
    client?: string;
  };
  /**
   * Configuration for assigning modules to specific Rspack layers.
   * This determines which modules are processed as React Server Components (RSC)
   * and which remain in the standard Server-Side Rendering (SSR) environment.
   */
  layers?: {
    /**
     * The condition to match React Server Components (RSC).
     * Modules matching this rule will be assigned to the `react-server` layer
     * and processed with the `react-server` export condition (server-only runtime).
     */
    rsc?: Rspack.RuleSetCondition;

    /**
     * The condition to match modules that must remain in the standard SSR (Node.js) layer.
     * **Priority:** This rule has higher priority than `rsc`.
     * Use this to explicitly force specific files (e.g., server entry points) to stay
     * in the standard Node.js environment, even if they overlap with the `rsc` pattern.
     */
    ssr?: Rspack.RuleSetCondition;
  };
};
