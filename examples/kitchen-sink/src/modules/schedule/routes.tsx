import { Effect } from 'effect';
import { HttpServerResponse } from 'effect/unstable/http';

import { ERSC } from '@/ersc';
import { AttendeeERSC } from '@/modules/conference/attendee';
import { SchedulePage } from '@/modules/schedule/components/schedule';
import ScheduleLayout from '@/modules/schedule/components/schedule-layout';
import ScheduleSkeleton from '@/modules/schedule/components/schedule-skeleton';

const OpeningDayRedirect = ERSC.Middleware.make(() =>
  Effect.succeed(HttpServerResponse.redirect('/schedule/saturday')),
);
const OpeningDayERSC = AttendeeERSC.withMiddleware(OpeningDayRedirect);

const ScheduleIndexPage = AttendeeERSC.Page.make({
  render: () =>
    Effect.succeed(
      <main>
        <a href='/schedule/saturday'>Open the Saturday schedule</a>
      </main>,
    ),
});

const scheduleIndexRoutes = OpeningDayERSC.Routes.make().page('/', ScheduleIndexPage);

export const scheduleRoutes = AttendeeERSC.Routes.make({
  layout: ScheduleLayout,
  loading: ScheduleSkeleton,
})
  .mount('/', scheduleIndexRoutes)
  .page('/:day', SchedulePage);
