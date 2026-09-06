import type { Effect, Scope } from 'effect';

export type BuildContext = {
  readonly root: string;
  readonly serverDir: string;
  readonly clientDir: string;
  readonly publicDir: string;
};

export type BuildHook = (context: BuildContext) => Effect.Effect<void, Error, Scope.Scope>;
