import { SqliteMigrator } from '@effect/sql-sqlite-bun';

import Migration001 from '@/persistence/Migrations/001_FixtureSelection';

const loader = SqliteMigrator.fromRecord({
  '1_FixtureSelection': Migration001,
});

export const runMigrations = SqliteMigrator.run({ loader });
