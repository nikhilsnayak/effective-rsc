import { ERSC } from '@/ersc';
import { SaturdaySchedulePage, SundaySchedulePage } from '@/modules/schedule/components/schedule';
import ScheduleLayout from '@/modules/schedule/components/schedule-layout';
import ScheduleSkeleton from '@/modules/schedule/components/schedule-skeleton';

export const scheduleRoutes = ERSC.Routes.make({
  layout: ScheduleLayout,
  loading: ScheduleSkeleton,
})
  .page('/', SaturdaySchedulePage)
  .page('/schedule/day-two', SundaySchedulePage);
