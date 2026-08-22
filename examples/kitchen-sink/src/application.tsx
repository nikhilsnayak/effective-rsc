import { Application } from 'effective-rsc';

import AgendaSkeleton from '@/modules/agenda/components/agenda-skeleton';
import PersonalAgenda from '@/modules/agenda/components/personal-agenda';
import {
  SaturdayConferenceNavigation,
  SundayConferenceNavigation,
} from '@/modules/conference/components/conference-navigation';
import ConferenceShell from '@/modules/conference/components/conference-shell';
import NavigationSkeleton from '@/modules/conference/components/navigation-skeleton';
import { ConferenceRepository } from '@/modules/conference/conference-repository';
import { SaturdaySchedulePage, SundaySchedulePage } from '@/modules/schedule/components/schedule';
import ScheduleSkeleton from '@/modules/schedule/components/schedule-skeleton';

export default Application.make({
  routes: {
    '/': {
      layout: ConferenceShell,
      loading: ScheduleSkeleton,
      page: SaturdaySchedulePage,
      slots: {
        agenda: {
          content: PersonalAgenda,
          loading: AgendaSkeleton,
        },
        modal: null,
        navigation: {
          content: SaturdayConferenceNavigation,
          loading: NavigationSkeleton,
        },
      },
    },
    '/schedule/day-two': {
      page: SundaySchedulePage,
      slots: {
        agenda: {
          content: PersonalAgenda,
          loading: AgendaSkeleton,
        },
        modal: null,
        navigation: {
          content: SundayConferenceNavigation,
          loading: NavigationSkeleton,
        },
      },
    },
  },
  servicesLayer: ConferenceRepository.layer,
});
