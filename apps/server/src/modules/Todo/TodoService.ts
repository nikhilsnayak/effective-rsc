import { Todo, type TodoId, TodoNotFound } from '@repo/contracts/modules/Todo';
import { Context, Effect, flow, Layer, Option, Schema } from 'effect';

import { mapDatabaseFailure } from '@/lib/db';

import { TodoRepository } from './TodoRepository.ts';

const decodeTodo = flow(Schema.decodeUnknownEffect(Todo), Effect.orDie);
const decodeTodos = flow(Schema.decodeUnknownEffect(Schema.Array(Todo)), Effect.orDie);

export class TodoService extends Context.Service<TodoService>()('@repo/server/Todo/TodoService', {
  make: Effect.gen(function* () {
    const todoRepository = yield* TodoRepository;

    const list = todoRepository.findAll.pipe(
      mapDatabaseFailure('TodoService.list'),
      Effect.flatMap(decodeTodos),
      Effect.withSpan('TodoService.list'),
    );

    const create = Effect.fn('TodoService.create')(function* (title: string) {
      const created = yield* todoRepository
        .create(title)
        .pipe(mapDatabaseFailure('TodoService.create'));
      if (Option.isNone(created)) {
        return yield* Effect.die(new Error('TodoRepository.create returned no row.'));
      }
      return yield* decodeTodo(created.value);
    });

    const toggle = Effect.fn('TodoService.toggle')(function* (todoId: TodoId) {
      const updated = yield* todoRepository
        .toggle(todoId)
        .pipe(mapDatabaseFailure('TodoService.toggle'));
      if (Option.isNone(updated)) {
        return yield* new TodoNotFound({ todoId });
      }
      return yield* decodeTodo(updated.value);
    });

    const remove = Effect.fn('TodoService.remove')(function* (todoId: TodoId) {
      const deleted = yield* todoRepository
        .remove(todoId)
        .pipe(mapDatabaseFailure('TodoService.remove'));
      if (!deleted) {
        return yield* new TodoNotFound({ todoId });
      }
    });

    return { list, create, toggle, remove };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
