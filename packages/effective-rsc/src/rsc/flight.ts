import type { ReactFormState } from 'react-dom/client';

import type { RouteTreeModel } from './route-tree';
import type { ServerFnFailureModel } from './server-fn-error';

export type RouteResponseModel = {
  readonly formState: ReactFormState | null;
  readonly routeTree: RouteTreeModel;
  readonly serverFnResponse: ServerFnResponseModel | null;
};

export type ServerFnResponseModel =
  | { readonly _tag: 'Success'; readonly value: unknown }
  | { readonly _tag: 'Failure'; readonly error: ServerFnFailureModel };

export const FlightMediaType = 'text/x-component';
export const ServerFnIdHeader = 'x-ersc-server-fn';
