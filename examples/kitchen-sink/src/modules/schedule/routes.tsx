import { Routes } from 'effective-rsc';

import { SaturdaySchedulePage, SundaySchedulePage } from '@/modules/schedule/components/schedule';
import ScheduleLayout from '@/modules/schedule/components/schedule-layout';
import ScheduleSkeleton from '@/modules/schedule/components/schedule-skeleton';

export const scheduleRoutes = Routes.make({
  layout: ScheduleLayout,
  loading: ScheduleSkeleton,
})
  .page('/', SaturdaySchedulePage)
  .page('/schedule/day-two', SundaySchedulePage);
