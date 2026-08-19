import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

import { InternalServerError } from '../../InternalServerError.ts';
import { Todo, TodoCreateInput, TodoMutationInput, TodoNotFound } from './Schemas.ts';

export const TodoRpcs = RpcGroup.make(
  Rpc.make('List', {
    payload: Schema.Void,
    success: Schema.Array(Todo),
    error: InternalServerError,
  }),
  Rpc.make('Create', {
    payload: TodoCreateInput,
    success: Todo,
    error: InternalServerError,
  }),
  Rpc.make('Toggle', {
    payload: TodoMutationInput,
    success: Todo,
    error: Schema.Union([TodoNotFound, InternalServerError]),
  }),
  Rpc.make('Delete', {
    payload: TodoMutationInput,
    error: Schema.Union([TodoNotFound, InternalServerError]),
  }),
).prefix('Todo.');
