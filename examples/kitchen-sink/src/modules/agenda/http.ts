import { DateTime, Effect } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/unstable/http';

import { formatAgendaCalendar } from '@/modules/agenda/calendar';
import { ConferenceService } from '@/modules/conference/service';

export const AgendaHttpLayer = HttpRouter.use(
  Effect.fnUntraced(function* (router) {
    const service = yield* ConferenceService;
    const agendaCalendarResponse = Effect.gen(function* () {
      const [agenda, conference, generatedAt] = yield* Effect.all(
        [service.agenda, service.conference, DateTime.now],
        { concurrency: 'unbounded' },
      );
      const calendar = formatAgendaCalendar({
        agenda: agenda.data,
        conference: conference.data,
        generatedAt,
      });

      return HttpServerResponse.text(calendar, {
        contentType: 'text/calendar; charset=utf-8',
        headers: {
          'cache-control': 'private, no-store',
          'content-disposition': `attachment; filename="converge-${conference.data.year}-agenda.ics"`,
        },
      });
    }).pipe(
      Effect.catchTag('@effective-rsc/example-kitchen-sink/conference/ConferenceUnavailable', () =>
        Effect.succeed(
          HttpServerResponse.text('The conference agenda is temporarily unavailable.', {
            status: 503,
          }),
        ),
      ),
    );

    yield* router.add('GET', '/agenda/calendar.ics', agendaCalendarResponse);
  }),
);
