import { RpcMiddleware } from 'effect/unstable/rpc';

import { InternalServerError } from './InternalServerError.ts';
import { TodoRpcs } from './modules/Todo/Rpcs.ts';

export class RpcDefectBoundary extends RpcMiddleware.Service<RpcDefectBoundary>()(
  '@repo/contracts/RpcDefectBoundary',
  { error: InternalServerError },
) {}

export const AppRpcs = TodoRpcs.middleware(RpcDefectBoundary);
