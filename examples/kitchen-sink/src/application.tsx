import { ERSC } from '@/ersc';
import ConferenceShell from '@/modules/conference/components/conference-shell';
import { ConferenceRepository } from '@/modules/conference/conference-repository';
import { scheduleRoutes } from '@/modules/schedule/routes';

export default ERSC.make({
  routes: ERSC.Routes.make({ layout: ConferenceShell }).mount('/schedule', scheduleRoutes),
  servicesLayer: ConferenceRepository.layer,
});
