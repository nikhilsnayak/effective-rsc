import { RpcDefectBoundary as RpcDefectBoundaryService } from '@repo/contracts/AppRpcs';
import { InternalServerError } from '@repo/contracts/InternalServerError';
import { Cause, Effect, Layer, Metric } from 'effect';

const rpcDefects = Metric.counter('app_rpc_defects_total', {
  description: 'Unexpected RPC handler defects.',
  incremental: true,
});

export const RpcDefectBoundaryLayer = Layer.succeed(RpcDefectBoundaryService)(
  RpcDefectBoundaryService.of((effect, { requestId, rpc }) =>
    effect.pipe(
      Effect.tapCauseIf(Cause.hasDies, (cause) =>
        Metric.update(rpcDefects.pipe(Metric.withAttributes({ rpc: rpc._tag })), 1).pipe(
          Effect.andThen(Effect.logError('Unhandled RPC defect.', cause)),
        ),
      ),
      Effect.catchDefect(() => Effect.fail(new InternalServerError({}))),
      Effect.annotateLogs({
        rpc: rpc._tag,
        requestId,
      }),
    ),
  ),
);
