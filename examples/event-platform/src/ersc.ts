import { Application } from 'effective-rsc';

import type { AttendeeService } from '@/modules/attendee/service';
import type { CheckInService } from '@/modules/check-in/service';
import type { CommunicationsService } from '@/modules/communications/service';
import type { EventAuthoringService } from '@/modules/event-authoring/service';
import type { EventService } from '@/modules/event/service';
import type { OrdersService } from '@/modules/orders/service';
import type { OrganizerService } from '@/modules/organizer/service';
import type { ProgrammeService } from '@/modules/programme/service';
import type { RegistrationSettingsService } from '@/modules/registration-settings/service';
import type { RegistrationService } from '@/modules/registration/service';
import type { ReportingService } from '@/modules/reporting/service';
import type { WaitlistService } from '@/modules/waitlist/service';

export const ERSC = Application.ersc<
  | AttendeeService
  | CheckInService
  | CommunicationsService
  | EventAuthoringService
  | EventService
  | OrganizerService
  | OrdersService
  | ProgrammeService
  | RegistrationService
  | RegistrationSettingsService
  | ReportingService
  | WaitlistService
>();
