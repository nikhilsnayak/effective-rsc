import { useAtomSet } from '@effect/atom-react';
import { deleteTodoAtom, isOptimisticId, toggleTodoAtom } from '@repo/client-runtime/modules/Todo';
import type { Todo } from '@repo/contracts/modules/Todo';
import { Exit } from 'effect';
import { startTransition } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { messageForTodoActionCause } from '../todo-error-messages.ts';

export function TodoItem({ todo }: { readonly todo: Todo }) {
  const toggleTodo = useAtomSet(toggleTodoAtom, { mode: 'promiseExit' });
  const deleteTodo = useAtomSet(deleteTodoAtom, { mode: 'promiseExit' });

  const disabled = isOptimisticId(todo.id);

  const onToggle = () => {
    startTransition(async () => {
      const exit = await toggleTodo({ payload: { todoId: todo.id } });
      if (Exit.isFailure(exit)) {
        Alert.alert('Error', messageForTodoActionCause('toggle', exit.cause));
      }
    });
  };

  const onDelete = () => {
    startTransition(async () => {
      const exit = await deleteTodo({ payload: { todoId: todo.id } });
      if (Exit.isFailure(exit)) {
        Alert.alert('Error', messageForTodoActionCause('delete', exit.cause));
      }
    });
  };

  return (
    <View style={[styles.row, disabled && styles.disabled]}>
      <Pressable
        accessibilityRole='checkbox'
        accessibilityState={{ checked: todo.completed, disabled }}
        disabled={disabled}
        onPress={onToggle}
        style={styles.toggle}
      >
        <View style={[styles.checkbox, todo.completed && styles.checkboxChecked]}>
          {todo.completed && <Text style={styles.check}>✓</Text>}
        </View>
        <Text style={[styles.title, todo.completed && styles.titleDone]}>{todo.title}</Text>
      </Pressable>
      <Pressable
        accessibilityRole='button'
        accessibilityLabel='Delete todo'
        disabled={disabled}
        onPress={onDelete}
        hitSlop={8}
      >
        <Text style={styles.delete}>Delete</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  disabled: { opacity: 0.6 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#999',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#111', borderColor: '#111' },
  check: { color: '#fff', fontSize: 14, lineHeight: 16 },
  title: { fontSize: 16, flexShrink: 1 },
  titleDone: { textDecorationLine: 'line-through', color: '#888' },
  delete: { color: '#dc2626', fontWeight: '600' },
});
