import { useAtomSet } from '@effect/atom-react';
import { createTodoAtom } from '@repo/client-runtime/modules/Todo';
import { Button } from '@repo/ui/components/button';
import { Field, FieldDescription, FieldLabel } from '@repo/ui/components/field';
import { Input } from '@repo/ui/components/input';
import { toast } from '@repo/ui/components/toast';
import { Exit } from 'effect';
import { startTransition, useState } from 'react';

import { messageForTodoActionCause } from '../todo-error-messages.ts';

export function TodoForm() {
  const createTodo = useAtomSet(createTodoAtom, { mode: 'promiseExit' });
  const [title, setTitle] = useState('');

  const addTodo = () => {
    const trimmed = title.trim();
    if (trimmed.length === 0) return;

    setTitle('');
    startTransition(async () => {
      const exit = await createTodo({ payload: { title: trimmed } });
      if (Exit.isFailure(exit)) toast.error(messageForTodoActionCause('create', exit.cause));
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        addTodo();
      }}
    >
      <Field>
        <FieldLabel htmlFor='new-todo'>New todo</FieldLabel>
        <div className='flex gap-2'>
          <Input
            id='new-todo'
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder='What needs doing?'
            className='flex-1'
          />
          <Button type='submit'>Add</Button>
        </div>
        <FieldDescription>Add something you need to get done.</FieldDescription>
      </Field>
    </form>
  );
}
