'use server';

export interface Todo {
  id: number;
  title: string;
  description: string;
  dueDate: string;
  isComplete: boolean;
}

const todos: Todo[] = [];

export async function getTodos(): Promise<Todo[]> {
  return todos;
}

export async function getTodo(id: number): Promise<Todo | undefined> {
  const todos = await getTodos();
  return todos.find((todo) => todo.id === id);
}

export async function createTodo(formData: FormData) {
  const todos = await getTodos();
  const title = formData.get('title');
  const description = formData.get('description');
  const dueDate = formData.get('dueDate');
  const id =
    todos.length > 0 ? Math.max(...todos.map((todo) => todo.id)) + 1 : 0;
  todos.push({
    id,
    title: typeof title === 'string' ? title : '',
    description: typeof description === 'string' ? description : '',
    dueDate: typeof dueDate === 'string' ? dueDate : new Date().toISOString(),
    isComplete: false,
  });
}

export async function updateTodo(id: number, formData: FormData) {
  const todos = await getTodos();
  const title = formData.get('title');
  const description = formData.get('description');
  const dueDate = formData.get('dueDate');
  const todo = todos.find((todo) => todo.id === id);
  if (todo) {
    todo.title = typeof title === 'string' ? title : '';
    todo.description = typeof description === 'string' ? description : '';
    todo.dueDate =
      typeof dueDate === 'string' ? dueDate : new Date().toISOString();
  }
}

export async function setTodoComplete(id: number, isComplete: boolean) {
  const todos = await getTodos();
  const todo = todos.find((todo) => todo.id === id);
  if (todo) {
    todo.isComplete = isComplete;
  }
}

export async function deleteTodo(id: number) {
  const todos = await getTodos();
  const index = todos.findIndex((todo) => todo.id === id);
  if (index >= 0) {
    todos.splice(index, 1);
  }
}
