import { expect, it, vi } from '@effect/vitest';
import { Deferred, Effect } from 'effect';

import type { RenderRuntimeContext } from '../../src/application/render-runtime';

let renderSignal: AbortSignal | undefined;

vi.doMock('react-server-dom-rspack/server.node', () => ({
  renderToReadableStream: (_model: unknown, options?: { readonly signal?: AbortSignal }) => {
    renderSignal = options?.signal;
    return new ReadableStream<Uint8Array>();
  },
}));

const { FlightRenderer } = await import('../../src/server/flight-renderer');

it.effect('interrupts application work when its Flight render is released', () =>
  Effect.scoped(
    Effect.gen(function* () {
      let runApplicationWork: (() => Promise<never>) | undefined;
      const started = yield* Deferred.make<void>();
      const interrupted = yield* Deferred.make<void>();
      const renderRuntime: RenderRuntimeContext = {
        bind: (runtime, _middleware, evaluate) => {
          runApplicationWork = () =>
            runtime(
              Deferred.succeed(started, void 0).pipe(
                Effect.andThen(Effect.never),
                Effect.onInterrupt(() => Deferred.succeed(interrupted, void 0)),
              ),
            );
          return evaluate();
        },
        run: () => {
          throw new TypeError('Unexpected request runtime invocation.');
        },
      };
      const renderer = yield* FlightRenderer;
      const flight = yield* renderer.render<never>({
        formState: null,
        middleware: [],
        renderRuntime,
        routeTree: {
          child: null,
          content: null,
          id: 'root',
        },
        serverFnResult: null,
      });
      if (runApplicationWork === undefined) {
        return yield* Effect.die('Expected Flight rendering to bind its request runtime.');
      }

      const applicationWork = runApplicationWork();
      const applicationWorkOutcome = applicationWork.then(
        () => 'completed' as const,
        () => 'interrupted' as const,
      );
      yield* Deferred.await(started);
      expect(renderSignal?.aborted).toBe(false);

      yield* flight.release;

      yield* Deferred.await(interrupted);
      const applicationOutcome = yield* Effect.promise(() => applicationWorkOutcome);
      expect(applicationOutcome).toBe('interrupted');
      expect(renderSignal?.aborted).toBe(true);
    }).pipe(Effect.provide(FlightRenderer.layer)),
  ),
);
