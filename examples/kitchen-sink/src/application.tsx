import { SqliteClient } from '@effect/sql-sqlite-bun';
import { Layer } from 'effect';
import { HttpRouter } from 'effect/unstable/http';

import { ERSC } from '@/ersc';
import { AgendaHttpLayer } from '@/modules/agenda/http';
import { ConferenceHomePage } from '@/modules/conference/components/conference-home';
import ConferenceShell from '@/modules/conference/components/conference-shell';
import { ConferenceRepository } from '@/modules/conference/repository';
import { ConferenceService } from '@/modules/conference/service';
import { scheduleRoutes } from '@/modules/schedule/routes';
import { runMigrations } from '@/persistence/Migrations';

import './styles.css';

const databasePath = Bun.env['CONFERENCE_DATABASE_PATH'] ?? '.data/conference.sqlite';
const SqliteLayer = SqliteClient.layer({ filename: databasePath });
const PersistenceLayer = Layer.effectDiscard(runMigrations).pipe(Layer.provideMerge(SqliteLayer));
const ConferenceInfrastructureLayer = ConferenceRepository.layer.pipe(
  Layer.provide(PersistenceLayer),
);
const ConferenceLayer = ConferenceService.layer.pipe(Layer.provide(ConferenceInfrastructureLayer));
const PublicHttpLayer = HttpRouter.cors({
  allowedMethods: ['GET', 'HEAD'],
  allowedOrigins: ['https://app.converge.example'],
});
const ApplicationLayer = Layer.mergeAll(AgendaHttpLayer, PublicHttpLayer).pipe(
  Layer.provideMerge(ConferenceLayer),
);

export default ERSC.make({
  routes: ERSC.Routes.make({ layout: ConferenceShell })
    .page('/', ConferenceHomePage)
    .mount('/schedule', scheduleRoutes),
  layer: ApplicationLayer,
});
