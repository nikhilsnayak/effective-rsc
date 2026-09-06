import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Layer } from 'effect';

import { loadCompiledServer, makeRunnableServerLayer } from '../build/compiled-server';
import { EnvironmentConfig } from '../build/contract';

export type StartOptions = {
  readonly hostname: string;
  readonly port: number;
  readonly root: string;
};

const resolveServerLayer = Effect.fnUntraced(function* ({ hostname, port, root }: StartOptions) {
  const bundle = yield* loadCompiledServer(root);
  return yield* makeRunnableServerLayer({
    bundle,
    clientAssetsCacheControl: EnvironmentConfig.production.clientAssetsCacheControl,
    clientOutputDir: EnvironmentConfig.production.clientOutputDir,
    hostname,
    port,
    root,
  });
});

export const serve = Effect.fn('ersc/server/serve')(function* (options: StartOptions) {
  yield* Layer.build(
    Layer.unwrap(resolveServerLayer(options)).pipe(Layer.provide(BunServices.layer)),
  );
});
