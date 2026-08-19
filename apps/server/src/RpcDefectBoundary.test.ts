import { assert, it } from '@effect/vitest';
import { RpcDefectBoundary as RpcDefectBoundaryService } from '@repo/contracts/AppRpcs';
import { InternalServerError } from '@repo/contracts/InternalServerError';
import { TodoRpcs } from '@repo/contracts/modules/Todo';
import { Cause, Effect, Exit, Layer, Logger, Option, References, Schema } from 'effect';
import { Headers } from 'effect/unstable/http';
import { Rpc } from 'effect/unstable/rpc';
import { RequestId } from 'effect/unstable/rpc/RpcMessage';

import { RpcDefectBoundaryLayer } from './RpcDefectBoundary.ts';

const listRpc = TodoRpcs.requests.get('Todo.List')!;

it.effect('returns a public error and logs the original defect cause', () =>
  Effect.gen(function* () {
    const logs: Array<{
      readonly message: unknown;
      readonly cause: Cause.Cause<unknown>;
      readonly annotations: Record<string, unknown>;
    }> = [];
    const logger = Logger.make<unknown, void>((options) => {
      logs.push({
        message: options.message,
        cause: options.cause,
        annotations: { ...options.fiber.getRef(References.CurrentLogAnnotations) },
      });
    });
    const defect = new Error('sensitive row value');

    const exit = yield* Effect.gen(function* () {
      const boundary = yield* RpcDefectBoundaryService;
      return yield* boundary(
        Effect.logInfo('Handler started.').pipe(Effect.andThen(Effect.die(defect))),
        {
          client: new Rpc.ServerClient(1),
          requestId: RequestId('request-1'),
          rpc: listRpc,
          payload: undefined,
          headers: Headers.empty,
        },
      );
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.merge(RpcDefectBoundaryLayer, Logger.layer([logger]))),
      Effect.exit,
    );

    assert(Exit.isFailure(exit));
    const error = Cause.findErrorOption(exit.cause);
    assert(Option.isSome(error));
    if (Option.isSome(error) && Schema.is(InternalServerError)(error.value)) {
      assert.strictEqual(error.value._tag, 'InternalServerError');
    } else {
      assert.fail('Expected InternalServerError.');
    }

    assert.strictEqual(logs.length, 2);
    assert.deepStrictEqual(logs[0]?.message, ['Handler started.']);
    assert.strictEqual(logs[0]?.annotations['rpc'], 'Todo.List');
    assert.strictEqual(logs[0]?.annotations['requestId'], 'request-1');
    assert.deepStrictEqual(logs[1]?.message, ['Unhandled RPC defect.']);
    assert.strictEqual(logs[1]?.annotations['rpc'], 'Todo.List');
    assert.strictEqual(logs[1]?.annotations['requestId'], 'request-1');
    assert.strictEqual(Cause.squash(logs[1]!.cause), defect);
  }),
);
