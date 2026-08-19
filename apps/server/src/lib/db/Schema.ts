import { TodoId } from '@repo/contracts/modules/Todo';
import { boolean, snakeCase, text, timestamp } from 'drizzle-orm/pg-core';

const table = snakeCase.table;

const createdAt = timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow();
const updatedAt = timestamp({ withTimezone: true, mode: 'string' })
  .notNull()
  .defaultNow()
  // oxlint-disable-next-line effecttsgo/global-date -- Drizzle's synchronous update hook requires a native Date-compatible value.
  .$onUpdate(() => new Date().toISOString());

export const Todos = table('todos', {
  id: text()
    .$type<TodoId>()
    .primaryKey()
    .$defaultFn(() => TodoId.make(Bun.randomUUIDv7())),
  title: text().notNull(),
  completed: boolean().notNull().default(false),
  createdAt,
  updatedAt,
});
