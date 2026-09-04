import { describe, expect, it, vi } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import { Application } from '../../src/application/ersc';
import { ServerConfig } from '../../src/server/server-config';

const serveLayer = vi.fn((_options: unknown) => Layer.empty);

vi.doMock('@effect/platform-bun/BunHttpServer', () => ({ layer: serveLayer }));
vi.doMock('react-server-dom-rspack/server.node', () => ({
  createTemporaryReferenceSet: () => ({}),
  decodeAction: () => Promise.resolve(null),
  decodeFormState: () => Promise.resolve(null),
  decodeReply: () => Promise.resolve([]),
  loadServerAction: () => {
    throw new Error('Unexpected Server Function action load.');
  },
  renderToReadableStream: () => {
    throw new Error('Unexpected Flight render.');
  },
}));

const { ServerApplication } = await import('../../src/server/application');

const ServerConfigLayer = Layer.succeed(
  ServerConfig,
  ServerConfig.of({
    clientAssetsRoot: '/tmp/ersc-client',
    clientBootstrapScripts: ['/_ersc/assets/main.js'],
    clientStylesheets: [],
    hostname: '127.0.0.1',
    port: 18193,
    publicAssetsRoot: '/tmp/ersc-public',
  }),
);

const makeApplication = () => {
  const ERSC = Application.ersc();
  return ERSC.make({
    routes: ERSC.Routes.make({
      layout: ERSC.Layout.make({ render: ({ children }) => Effect.succeed(children) }),
    }).page('/', ERSC.Page.make({ render: () => Effect.succeed(null) })),
  });
};

const buildServerLayer = Effect.scoped(
  Effect.exit(
    Layer.build(
      ServerApplication.serverLayer(makeApplication()).pipe(Layer.provide(ServerConfigLayer)),
    ),
  ),
);

describe('ServerApplication.serverLayer', () => {
  it.effect('binds Bun with contextual error pages disabled', () =>
    Effect.gen(function* () {
      serveLayer.mockClear();
      yield* buildServerLayer;

      expect(serveLayer).toHaveBeenCalledTimes(1);
      expect(serveLayer.mock.calls[0]?.[0]).toMatchObject({
        development: false,
        hostname: '127.0.0.1',
        port: 18193,
      });
    }),
  );

  it.effect('disables the idle timeout so a stalled boundary keeps its connection', () =>
    Effect.gen(function* () {
      serveLayer.mockClear();
      yield* buildServerLayer;

      expect(serveLayer.mock.calls[0]?.[0]).toMatchObject({ idleTimeout: 0 });
    }),
  );
});
