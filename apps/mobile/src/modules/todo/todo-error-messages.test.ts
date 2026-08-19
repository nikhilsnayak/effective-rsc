import { InternalServerError } from '@repo/contracts/InternalServerError';
import { TodoId, TodoNotFound } from '@repo/contracts/modules/Todo';
import { Cause } from 'effect';
import { describe, expect, it } from 'vitest';

import { messageForTodoActionCause } from './todo-error-messages.ts';

describe('messageForTodoActionCause', () => {
  it('keeps expected absence contextual', () => {
    const message = messageForTodoActionCause(
      'toggle',
      Cause.fail(new TodoNotFound({ todoId: TodoId.make('todo-1') })),
    );

    expect(message).toBe('That todo no longer exists — your list may be out of date.');
  });

  it('uses action-specific copy for opaque server failures', () => {
    const message = messageForTodoActionCause('delete', Cause.fail(new InternalServerError({})));

    expect(message).toBe("Couldn't delete the todo. Check your connection and try again.");
  });

  it('uses action-specific copy for defects without exposing details', () => {
    const message = messageForTodoActionCause(
      'create',
      Cause.die(new Error('private implementation detail')),
    );

    expect(message).toBe("Couldn't create the todo. Check your connection and try again.");
  });
});
