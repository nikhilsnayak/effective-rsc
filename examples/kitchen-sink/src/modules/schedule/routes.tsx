import { ERSC } from '@/ersc';
import { SchedulePage } from '@/modules/schedule/components/schedule';
import ScheduleLayout from '@/modules/schedule/components/schedule-layout';
import ScheduleSkeleton from '@/modules/schedule/components/schedule-skeleton';

export const scheduleRoutes = ERSC.Routes.make({
  layout: ScheduleLayout,
  loading: ScheduleSkeleton,
}).page('/:day', SchedulePage);
