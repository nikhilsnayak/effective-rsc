import { DateTime, Effect } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/unstable/http';

import { FixtureService } from '@/modules/fixture/service';
import { formatSelectionManifest } from '@/modules/selection/export';

export const SelectionHttpLayer = HttpRouter.use(
  Effect.fnUntraced(function* (router) {
    const service = yield* FixtureService;
    const selectionManifestResponse = Effect.gen(function* () {
      const [selection, fixture, generatedAt] = yield* Effect.all(
        [service.selection, service.fixture, DateTime.now],
        { concurrency: 'unbounded' },
      );
      const manifest = formatSelectionManifest({
        selection: selection.data,
        fixture: fixture.data,
        generatedAt: DateTime.formatIso(generatedAt),
      });

      return HttpServerResponse.text(manifest, {
        contentType: 'text/csv; charset=utf-8',
        headers: {
          'cache-control': 'private, no-store',
          'content-disposition': 'attachment; filename="framework-fixture-selection.csv"',
        },
      });
    }).pipe(
      Effect.catchTag('@effective-rsc/framework-e2e/fixture/FixtureUnavailable', () =>
        Effect.succeed(
          HttpServerResponse.text('The fixture selection is temporarily unavailable.', {
            status: 503,
          }),
        ),
      ),
    );

    yield* router.add('GET', '/selection/export.csv', selectionManifestResponse);
  }),
);
