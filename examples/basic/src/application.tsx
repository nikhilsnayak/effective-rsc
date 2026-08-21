import { Application } from 'effective-rsc';

import RootLayout from './app/layout';
import RootLoading from './app/loading';
import HomePage from './app/page';
import { Greeting } from './greeting';

const ApplicationLayer = Greeting.layer;

export default Application.make({
  routes: {
    '/': {
      layout: RootLayout,
      loading: RootLoading,
      page: HomePage,
    },
  },
  servicesLayer: ApplicationLayer,
});
