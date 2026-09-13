import type { TemporaryReferenceSet } from 'react-server-dom-rspack/server.node';

import type { RouteResponseModel } from '../rsc/flight';

export type RequestOutcome = {
  readonly formState: RouteResponseModel['formState'];
  readonly serverFnResponse: RouteResponseModel['serverFnResponse'];
  readonly status: 200;
  readonly temporaryReferences?: TemporaryReferenceSet;
};
