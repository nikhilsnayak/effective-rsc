import { AppRpcs } from '@repo/contracts/AppRpcs';
import { Layer } from 'effect';
import { RpcServer } from 'effect/unstable/rpc';

import { TodoHandlersLayer } from './modules/Todo/Handlers.ts';
import { TodoRepository } from './modules/Todo/TodoRepository.ts';
import { TodoService } from './modules/Todo/TodoService.ts';
import { RpcDefectBoundaryLayer } from './RpcDefectBoundary.ts';

export const RpcLayer = RpcServer.layer(AppRpcs).pipe(
  Layer.provide(TodoHandlersLayer),
  Layer.provide(RpcDefectBoundaryLayer),
  Layer.provide(TodoService.layer),
  Layer.provide(TodoRepository.layer),
);
