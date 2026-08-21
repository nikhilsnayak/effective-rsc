import type { ReactNode } from 'react';
import type { ReactFormState } from 'react-dom/client';

export type FlightPayload = {
  readonly formState: ReactFormState | null;
  readonly root: ReactNode;
};
