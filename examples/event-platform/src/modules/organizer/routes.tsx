import { CheckInConsolePage } from '@/modules/check-in/components/check-in-console';
import { CommunicationsPage } from '@/modules/communications/components/communications-page';
import {
  CreateEventPage,
  EditEventPage,
} from '@/modules/event-authoring/components/authoring-pages';
import { OrdersPage } from '@/modules/orders/components/orders-page';
import { OrganizerDashboardPage } from '@/modules/organizer/components/organizer-dashboard';
import { OrganizerERSC } from '@/modules/organizer/current-organizer';
import { programmeRoutes } from '@/modules/programme/routes';
import { RegistrationSettingsPage } from '@/modules/registration-settings/components/registration-settings-page';
import { EventReportPage } from '@/modules/reporting/components/event-report';
import { WaitlistPage } from '@/modules/waitlist/components/waitlist-page';

export const organizerRoutes = OrganizerERSC.Routes.make()
  .page('/', OrganizerDashboardPage)
  .page('/organizations/:organizationId/events/new', CreateEventPage)
  .page('/events/:eventId/edit', EditEventPage)
  .page('/events/:eventId/communications', CommunicationsPage)
  .page('/events/:eventId/orders', OrdersPage)
  .page('/events/:eventId/reports', EventReportPage)
  .page('/events/:eventId/registration', RegistrationSettingsPage)
  .page('/events/:eventId/waitlist', WaitlistPage)
  .page('/check-in/:eventId', CheckInConsolePage)
  .mount('/events', programmeRoutes);
