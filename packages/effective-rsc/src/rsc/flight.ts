import type { ReactNode } from 'react';
import type { ReactFormState } from 'react-dom/client';

export type FlightPayload = {
  readonly formState: ReactFormState | null;
  readonly root: ReactNode;
  readonly serverFnResult: ServerFnResult | null;
};

export type ServerFnResult =
  | { readonly _tag: 'Success'; readonly value: unknown }
  | { readonly _tag: 'Failure'; readonly error: unknown };

export const FlightMediaType = 'text/x-component';
export const ServerFnIdHeader = 'x-ersc-server-fn';
