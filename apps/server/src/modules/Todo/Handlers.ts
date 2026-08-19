import { TodoRpcs } from '@repo/contracts/modules/Todo';
import { Effect } from 'effect';

import { TodoService } from './TodoService.ts';

export const TodoHandlersLayer = TodoRpcs.toLayer(
  Effect.gen(function* () {
    const todoService = yield* TodoService;
    return TodoRpcs.of({
      'Todo.List': () => todoService.list,
      'Todo.Create': ({ title }) => todoService.create(title),
      'Todo.Toggle': ({ todoId }) => todoService.toggle(todoId),
      'Todo.Delete': ({ todoId }) => todoService.remove(todoId),
    });
  }),
);
