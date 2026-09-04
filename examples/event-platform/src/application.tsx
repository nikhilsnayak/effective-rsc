import { Layer } from 'effect';
import { HttpRouter } from 'effect/unstable/http';

import { ERSC } from '@/ersc';
import { EmailGateway } from '@/modules/attendee/email-gateway';
import { AttendeeAccessHttpLayer } from '@/modules/attendee/http';
import { AttendeeRepository } from '@/modules/attendee/repository';
import { attendeeRoutes } from '@/modules/attendee/routes';
import { AttendeeService } from '@/modules/attendee/service';
import { CheckInRepository } from '@/modules/check-in/repository';
import { CheckInService } from '@/modules/check-in/service';
import { CommunicationsRepository } from '@/modules/communications/repository';
import { CommunicationsService } from '@/modules/communications/service';
import { EventAuthoringRepository } from '@/modules/event-authoring/repository';
import { EventAuthoringService } from '@/modules/event-authoring/service';
import { EventCatalogPage } from '@/modules/event/components/event-catalog';
import { EventDetailPage } from '@/modules/event/components/event-detail';
import { EventRepository } from '@/modules/event/repository';
import { EventService } from '@/modules/event/service';
import { OrdersRepository } from '@/modules/orders/repository';
import { OrdersService } from '@/modules/orders/service';
import { OrganizerRepository } from '@/modules/organizer/repository';
import { organizerRoutes } from '@/modules/organizer/routes';
import { OrganizerService } from '@/modules/organizer/service';
import PlatformShell from '@/modules/platform/components/platform-shell';
import { PublicProgrammePage } from '@/modules/programme/components/programme-pages';
import { ProgrammeRepository } from '@/modules/programme/repository';
import { ProgrammeService } from '@/modules/programme/service';
import { RegistrationSettingsRepository } from '@/modules/registration-settings/repository';
import { RegistrationSettingsService } from '@/modules/registration-settings/service';
import { RegistrationPage } from '@/modules/registration/components/registration-page';
import { PaymentGateway } from '@/modules/registration/payment-gateway';
import { RegistrationRepository } from '@/modules/registration/repository';
import { RegistrationService } from '@/modules/registration/service';
import { ReportingRepository } from '@/modules/reporting/repository';
import { ReportingService } from '@/modules/reporting/service';
import { WaitlistRepository } from '@/modules/waitlist/repository';
import { WaitlistService } from '@/modules/waitlist/service';
import { PersistenceLayer } from '@/persistence/layer';

import './styles.css';

const InfrastructureLayer = Layer.mergeAll(
  AttendeeRepository.layer,
  CheckInRepository.layer,
  CommunicationsRepository.layer,
  EmailGateway.layer,
  EventAuthoringRepository.layer,
  EventRepository.layer,
  OrganizerRepository.layer,
  OrdersRepository.layer,
  PaymentGateway.layer,
  ProgrammeRepository.layer,
  RegistrationRepository.layer,
  RegistrationSettingsRepository.layer,
  ReportingRepository.layer,
  WaitlistRepository.layer,
).pipe(Layer.provide(PersistenceLayer));
const DomainLayer = Layer.mergeAll(
  AttendeeService.layer,
  CheckInService.layer,
  CommunicationsService.layer,
  EventAuthoringService.layer,
  EventService.layer,
  OrganizerService.layer,
  OrdersService.layer,
  ProgrammeService.layer,
  RegistrationService.layer,
  RegistrationSettingsService.layer,
  ReportingService.layer,
  WaitlistService.layer,
).pipe(Layer.provide(InfrastructureLayer));
const PublicHttpLayer = HttpRouter.cors({
  allowedMethods: ['GET', 'HEAD'],
  allowedOrigins: ['https://app.effective-rsc.example'],
});
const ApplicationLayer = Layer.mergeAll(AttendeeAccessHttpLayer, PublicHttpLayer).pipe(
  Layer.provideMerge(DomainLayer),
);

export default ERSC.make({
  routes: ERSC.Routes.make({ layout: PlatformShell })
    .page('/', EventCatalogPage)
    .page('/events/:organizationSlug/:eventSlug/programme', PublicProgrammePage)
    .page('/events/:organizationSlug/:eventSlug/register', RegistrationPage)
    .page('/events/:organizationSlug/:eventSlug', EventDetailPage)
    .mount('/attendee', attendeeRoutes)
    .mount('/organizer', organizerRoutes),
  layer: ApplicationLayer,
});
