import { Application, Routes } from 'effective-rsc';

import ConferenceShell from '@/modules/conference/components/conference-shell';
import { ConferenceRepository } from '@/modules/conference/conference-repository';
import { scheduleRoutes } from '@/modules/schedule/routes';

export default Application.make({
  routes: Routes.make({ layout: ConferenceShell }).mount('/', scheduleRoutes),
  servicesLayer: ConferenceRepository.layer,
});
