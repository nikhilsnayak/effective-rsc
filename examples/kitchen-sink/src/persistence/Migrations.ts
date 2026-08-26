import { SqliteMigrator } from '@effect/sql-sqlite-bun';

import Migration001 from './Migrations/001_ConferenceAgenda';

const loader = SqliteMigrator.fromRecord({
  '1_ConferenceAgenda': Migration001,
});

export const runMigrations = SqliteMigrator.run({ loader });
