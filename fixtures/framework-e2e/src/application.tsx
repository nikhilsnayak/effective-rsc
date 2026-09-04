import { SqliteClient } from '@effect/sql-sqlite-bun';
import { Layer } from 'effect';
import { HttpRouter } from 'effect/unstable/http';

import { ERSC } from '@/ersc';
import { catalogRoutes } from '@/modules/catalog/routes';
import { FixtureHomePage } from '@/modules/fixture/components/fixture-home';
import FixtureShell from '@/modules/fixture/components/fixture-shell';
import { FixtureRepository } from '@/modules/fixture/repository';
import { FixtureService } from '@/modules/fixture/service';
import { SelectionHttpLayer } from '@/modules/selection/http';
import { runMigrations } from '@/persistence/Migrations';

import './styles.css';

const SqliteLayer = SqliteClient.layer({ filename: ':memory:' });
const PersistenceLayer = Layer.effectDiscard(runMigrations).pipe(Layer.provideMerge(SqliteLayer));
const FixtureInfrastructureLayer = FixtureRepository.layer.pipe(Layer.provide(PersistenceLayer));
const FixtureLayer = FixtureService.layer.pipe(Layer.provide(FixtureInfrastructureLayer));
const PublicHttpLayer = HttpRouter.cors({
  allowedMethods: ['GET', 'HEAD'],
  allowedOrigins: ['https://app.effective-rsc.example'],
});
const ApplicationLayer = Layer.mergeAll(SelectionHttpLayer, PublicHttpLayer).pipe(
  Layer.provideMerge(FixtureLayer),
);

export default ERSC.make({
  routes: ERSC.Routes.make({ layout: FixtureShell })
    .page('/', FixtureHomePage)
    .mount('/catalog', catalogRoutes),
  layer: ApplicationLayer,
});
