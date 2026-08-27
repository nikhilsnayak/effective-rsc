import { Effect } from 'effect';
import { HttpServerResponse } from 'effect/unstable/http';

import { ERSC } from '@/ersc';
import { SchedulePage } from '@/modules/schedule/components/schedule';
import ScheduleLayout from '@/modules/schedule/components/schedule-layout';
import ScheduleSkeleton from '@/modules/schedule/components/schedule-skeleton';

const PersonalizedScheduleCachePolicy = ERSC.Routes.middleware({
  handler: (httpEffect) =>
    Effect.map(httpEffect, HttpServerResponse.setHeader('cache-control', 'private, no-store')),
});

const OpeningDayRedirect = ERSC.Routes.middleware({
  handler: () => Effect.succeed(HttpServerResponse.redirect('/schedule/saturday')),
});

const ScheduleIndexPage = ERSC.Page.make({
  render: () =>
    Effect.succeed(
      <main>
        <a href='/schedule/saturday'>Open the Saturday schedule</a>
      </main>,
    ),
});

const scheduleIndexRoutes = ERSC.Routes.make({
  middleware: [OpeningDayRedirect],
}).page('/', ScheduleIndexPage);

export const scheduleRoutes = ERSC.Routes.make({
  layout: ScheduleLayout,
  loading: ScheduleSkeleton,
  middleware: [PersonalizedScheduleCachePolicy],
})
  .mount('/', scheduleIndexRoutes)
  .page('/:day', SchedulePage);
