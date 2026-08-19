import { useAtomSet } from '@effect/atom-react';
import { createTodoAtom } from '@repo/client-runtime/modules/Todo';
import { Exit } from 'effect';
import { startTransition, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

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
      if (Exit.isFailure(exit)) {
        Alert.alert('Error', messageForTodoActionCause('create', exit.cause));
      }
    });
  };

  return (
    <View style={styles.form}>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder='What needs doing?'
        returnKeyType='done'
        onSubmitEditing={addTodo}
      />
      <Pressable style={styles.button} onPress={addTodo} accessibilityRole='button'>
        <Text style={styles.buttonText}>Add</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
});
