import type { ReactFormState } from 'react-dom/client';

import type { RouteTreeModel } from './route-tree';

export type FlightPayload = {
  readonly formState: ReactFormState | null;
  readonly routeTree: RouteTreeModel;
  readonly serverFnResult: ServerFnResult | null;
};

export type ServerFnResult =
  | { readonly _tag: 'Success'; readonly value: unknown }
  | { readonly _tag: 'Failure'; readonly error: unknown };

export const FlightMediaType = 'text/x-component';
export const ServerFnIdHeader = 'x-ersc-server-fn';
