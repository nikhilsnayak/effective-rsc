import { OrganizerERSC } from '@/modules/organizer/current-organizer';
import ProgrammeLoading from '@/modules/programme/components/programme-loading';
import { ProgrammeEditorPage } from '@/modules/programme/components/programme-pages';

export const programmeRoutes = OrganizerERSC.Routes.make({ loading: ProgrammeLoading }).page(
  '/:eventId/programme',
  ProgrammeEditorPage,
);
