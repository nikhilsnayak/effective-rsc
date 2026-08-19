import { assert, describe, it } from '@effect/vitest';
import { TodoId } from '@repo/contracts/modules/Todo';
import { Cause, Effect, Exit, Layer, Option } from 'effect';

import { TodoRepository } from './TodoRepository.ts';
import { TodoService } from './TodoService.ts';

const todoId = TodoId.make('todo-1');
const todo = {
  id: todoId,
  title: 'Study the service boundary',
  completed: false,
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
};

const withRepository = (repository: Layer.Layer<TodoRepository>) =>
  Effect.provide(TodoService.layer.pipe(Layer.provide(repository)));

describe('TodoService', () => {
  it.effect('returns a decoded repository projection', () =>
    Effect.gen(function* () {
      const service = yield* TodoService;
      assert.deepStrictEqual(yield* service.list, [todo]);
    }).pipe(withRepository(TodoRepository.layerTest({ findAll: Effect.succeed([todo]) }))),
  );

  it.effect('treats an invalid repository projection as a defect', () =>
    Effect.gen(function* () {
      const service = yield* TodoService;
      const exit = yield* Effect.exit(service.list);
      assert(Exit.isFailure(exit));
      assert(Cause.hasDies(exit.cause));
    }).pipe(
      withRepository(
        TodoRepository.layerTest({
          findAll: Effect.succeed([{ ...todo, completed: 'not-a-boolean' } as never]),
        }),
      ),
    ),
  );

  it.effect('treats create returning no row as a repository invariant defect', () =>
    Effect.gen(function* () {
      const service = yield* TodoService;
      const exit = yield* Effect.exit(service.create('A todo'));
      assert(Exit.isFailure(exit));
      assert(Cause.hasDies(exit.cause));
    }).pipe(
      withRepository(TodoRepository.layerTest({ create: () => Effect.succeed(Option.none()) })),
    ),
  );

  it.effect('fails with TodoNotFound when toggling a missing todo', () =>
    Effect.gen(function* () {
      const service = yield* TodoService;
      const error = yield* service.toggle(todoId).pipe(Effect.flip);
      assert.strictEqual(error._tag, 'TodoNotFound');
      if (error._tag === 'TodoNotFound') {
        assert.strictEqual(error.todoId, todoId);
      }
    }).pipe(
      withRepository(TodoRepository.layerTest({ toggle: () => Effect.succeed(Option.none()) })),
    ),
  );

  it.effect('fails with TodoNotFound when deleting a missing todo', () =>
    Effect.gen(function* () {
      const service = yield* TodoService;
      const error = yield* service.remove(todoId).pipe(Effect.flip);
      assert.strictEqual(error._tag, 'TodoNotFound');
      if (error._tag === 'TodoNotFound') {
        assert.strictEqual(error.todoId, todoId);
      }
    }).pipe(withRepository(TodoRepository.layerTest({ remove: () => Effect.succeed(false) }))),
  );
});
