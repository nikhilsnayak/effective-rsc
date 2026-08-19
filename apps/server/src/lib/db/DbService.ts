import * as PgClient from '@effect/sql-pg/PgClient';
import { defineRelations } from 'drizzle-orm';
import * as PgDrizzle from 'drizzle-orm/effect-postgres';
import { Config, Context, Layer } from 'effect';

import * as schema from './Schema.ts';

const relations = defineRelations(schema, () => ({}));
const PgClientLayer = PgClient.layerConfig({
  url: Config.redacted('DATABASE_URL'),
});

export class DbService extends Context.Service<DbService>()('@repo/server/Db/DbService', {
  make: PgDrizzle.makeWithDefaults({ relations }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(PgClientLayer));
}
