import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect } from 'effect';
import type { BuildHook } from 'effective-rsc/build';

import { packageForVercel, VercelBuildError } from './package';

export const build: BuildHook = Effect.fn('@ersc/vercel/build')(function* (context) {
  const serverEntry = yield* Effect.try({
    try: () => Bun.resolveSync('effective-rsc/server', context.root),
    catch: (cause) =>
      new VercelBuildError({
        message: 'Cannot resolve effective-rsc/server from the application.',
        cause,
      }),
  });
  yield* packageForVercel({ ...context, serverEntry });
}, Effect.provide(BunServices.layer));
