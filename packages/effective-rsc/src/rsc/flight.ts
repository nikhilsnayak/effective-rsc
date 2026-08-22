import type { ReactNode } from 'react';
import type { ReactFormState } from 'react-dom/client';

export type FlightPayload = {
  readonly formState: ReactFormState | null;
  readonly root: ReactNode;
  readonly serverFnResult: ServerFnResult | null;
};

export type ServerFnResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly error: unknown; readonly ok: false };

export const ServerFnIdHeader = 'x-ersc-server-fn';
