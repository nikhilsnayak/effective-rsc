import { useAtomSet } from '@effect/atom-react';
import { deleteTodoAtom, isOptimisticId, toggleTodoAtom } from '@repo/client-runtime/modules/Todo';
import type { Todo } from '@repo/contracts/modules/Todo';
import { Button } from '@repo/ui/components/button';
import { Checkbox } from '@repo/ui/components/checkbox';
import { Field, FieldLabel } from '@repo/ui/components/field';
import { toast } from '@repo/ui/components/toast';
import { cn } from '@repo/ui/lib/utils';
import { Exit } from 'effect';
import { Trash2 } from 'lucide-react';
import { startTransition } from 'react';

import { messageForTodoActionCause } from '../todo-error-messages.ts';

export function TodoItem({ todo }: { readonly todo: Todo }) {
  const toggleTodo = useAtomSet(toggleTodoAtom, { mode: 'promiseExit' });
  const deleteTodo = useAtomSet(deleteTodoAtom, { mode: 'promiseExit' });

  const disabled = isOptimisticId(todo.id);

  const onToggle = () => {
    startTransition(async () => {
      const exit = await toggleTodo({ payload: { todoId: todo.id } });
      if (Exit.isFailure(exit)) toast.error(messageForTodoActionCause('toggle', exit.cause));
    });
  };

  const onDelete = () => {
    startTransition(async () => {
      const exit = await deleteTodo({ payload: { todoId: todo.id } });
      if (Exit.isFailure(exit)) toast.error(messageForTodoActionCause('delete', exit.cause));
    });
  };

  return (
    <li className={cn('rounded-lg border border-border px-3 py-2', disabled && 'opacity-60')}>
      <Field orientation='horizontal'>
        <Checkbox
          id={todo.id}
          aria-label='Toggle todo'
          checked={todo.completed}
          disabled={disabled}
          onCheckedChange={onToggle}
        />
        <FieldLabel
          htmlFor={todo.id}
          className={cn(todo.completed && 'text-muted-foreground line-through')}
        >
          {todo.title}
        </FieldLabel>
        <Button
          type='button'
          variant='ghost'
          size='icon-sm'
          aria-label='Delete todo'
          disabled={disabled}
          onClick={onDelete}
          className='text-muted-foreground hover:text-destructive'
        >
          <Trash2 />
        </Button>
      </Field>
    </li>
  );
}
