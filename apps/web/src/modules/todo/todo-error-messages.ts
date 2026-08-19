import { TodoNotFound } from '@repo/contracts/modules/Todo';
import { Cause, Option, Schema } from 'effect';

type TodoAction = 'create' | 'toggle' | 'delete';

const actionFailureMessages = {
  create: "Couldn't create the todo. Check your connection and try again.",
  toggle: "Couldn't update the todo. Check your connection and try again.",
  delete: "Couldn't delete the todo. Check your connection and try again.",
} satisfies Record<TodoAction, string>;

const isTodoNotFound = Schema.is(TodoNotFound);

export const messageForTodoActionCause = (
  action: TodoAction,
  cause: Cause.Cause<unknown>,
): string =>
  Option.match(Cause.findErrorOption(cause), {
    onNone: () => actionFailureMessages[action],
    onSome: (error) =>
      isTodoNotFound(error)
        ? 'That todo no longer exists — your list may be out of date.'
        : actionFailureMessages[action],
  });
