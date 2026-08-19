import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TodoForm } from '@/modules/todo/components/todo-form';
import { TodoList } from '@/modules/todo/components/todo-list';

export default function Index() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Todos' }} />
      <TodoForm />
      <View style={styles.list}>
        <TodoList />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16 },
  list: { flex: 1 },
});
