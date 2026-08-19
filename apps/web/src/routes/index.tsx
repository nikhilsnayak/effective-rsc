import { createFileRoute } from '@tanstack/react-router';

import { TodoForm } from '@/modules/todo/components/todo-form';
import { TodoList } from '@/modules/todo/components/todo-list';

export const Route = createFileRoute('/')({
  component: IndexPage,
});

function IndexPage() {
  return (
    <main className='mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 p-8'>
      <h1 className='text-2xl font-semibold'>Todos</h1>
      <TodoForm />
      <TodoList />
    </main>
  );
}
