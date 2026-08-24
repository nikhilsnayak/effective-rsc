import type { TemporaryReferenceSet } from 'react-server-dom-rspack/server.node';

import type { FlightPayload } from '../rsc/flight';

export type RequestOutcome = {
  readonly formState: FlightPayload['formState'];
  readonly serverFnResult: FlightPayload['serverFnResult'];
  readonly status: number;
  readonly temporaryReferences?: TemporaryReferenceSet;
};
