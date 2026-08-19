import { useAtomValue } from '@effect/atom-react';
import { todosAtom } from '@repo/client-runtime/modules/Todo';
import { AsyncResult } from 'effect/unstable/reactivity';

import { TodoItem } from './todo-item';

export function TodoList() {
  const todos = useAtomValue(todosAtom);

  return AsyncResult.match(todos, {
    onInitial: () => <p className='text-muted-foreground'>Loading…</p>,
    onFailure: () => <p className='text-destructive'>Failed to load todos.</p>,
    onSuccess: (result) =>
      result.value.length === 0 ? (
        <p className='text-muted-foreground'>Nothing yet. Add your first todo.</p>
      ) : (
        <ul className='flex flex-col gap-2'>
          {result.value.map((todo) => (
            <TodoItem key={todo.id} todo={todo} />
          ))}
        </ul>
      ),
  });
}
