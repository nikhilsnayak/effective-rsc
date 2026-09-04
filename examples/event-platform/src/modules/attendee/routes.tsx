import { AttendeeDashboardPage } from '@/modules/attendee/components/attendee-dashboard';
import { AttendeeTicketPage } from '@/modules/attendee/components/attendee-ticket';
import { AttendeeHubERSC } from '@/modules/attendee/current-attendee';

export const attendeeRoutes = AttendeeHubERSC.Routes.make()
  .page('/', AttendeeDashboardPage)
  .page('/:ticketCode', AttendeeTicketPage);
