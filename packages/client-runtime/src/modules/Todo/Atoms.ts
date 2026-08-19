import { TodoId } from '@repo/contracts/modules/Todo';
import { DateTime } from 'effect';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';

import { AppRpcClient } from '../../AppRpcClient.ts';

const OPTIMISTIC_ID_PREFIX = 'optimistic:';

let optimisticIdSequence = 0;

/**
 * A client-only id for an optimistic row that has not been persisted yet.
 * Never send this to the server — it is replaced by the real id on refresh.
 */
const optimisticId = (): TodoId =>
  TodoId.make(
    `${OPTIMISTIC_ID_PREFIX}${DateTime.toEpochMillis(DateTime.nowUnsafe()).toString(36)}-${(optimisticIdSequence++).toString(
      36,
    )}`,
  );

export const isOptimisticId = (id: string): boolean => id.startsWith(OPTIMISTIC_ID_PREFIX);

const todosQuery = AppRpcClient.query('Todo.List', undefined);

export const todosAtom = todosQuery.pipe(Atom.optimistic);

export const createTodoAtom = todosAtom.pipe(
  Atom.optimisticFn({
    fn: AppRpcClient.mutation('Todo.Create'),
    reducer: (current, update) => {
      const now = DateTime.formatIso(DateTime.nowUnsafe());
      return AsyncResult.map(current, (todos) => [
        {
          id: optimisticId(),
          title: update.payload.title,
          completed: false,
          createdAt: now,
          updatedAt: now,
        },
        ...todos,
      ]);
    },
  }),
);

export const toggleTodoAtom = todosAtom.pipe(
  Atom.optimisticFn({
    fn: AppRpcClient.mutation('Todo.Toggle'),
    reducer: (current, update) =>
      AsyncResult.map(current, (todos) =>
        todos.map((todo) =>
          todo.id === update.payload.todoId ? { ...todo, completed: !todo.completed } : todo,
        ),
      ),
  }),
);

export const deleteTodoAtom = todosAtom.pipe(
  Atom.optimisticFn({
    fn: AppRpcClient.mutation('Todo.Delete'),
    reducer: (current, update) =>
      AsyncResult.map(current, (todos) =>
        todos.filter((todo) => todo.id !== update.payload.todoId),
      ),
  }),
);
