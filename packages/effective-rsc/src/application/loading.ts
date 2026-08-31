import { type Effect } from 'effect';
import type { ReactNode } from 'react';

import { attachERSCMember, type ERSCIdentity, type ERSCMember } from './ersc-identity';

export interface LoadingComponent<Services> extends ERSCMember<Services, 'Loading'> {
  (): Awaited<ReactNode>;
}

type NonEffectOutput<Output> = [Extract<Output, Effect.Effect<unknown, unknown, unknown>>] extends [
  never,
]
  ? unknown
  : never;

type LoadingOptions<Output extends Awaited<ReactNode>> = {
  readonly render: (() => Output) & NonEffectOutput<Output>;
};

export type LoadingFactory<Services> = {
  readonly make: <Output extends Awaited<ReactNode>>(
    options: LoadingOptions<Output>,
  ) => LoadingComponent<Services>;
};

export const makeLoadingFactory = <Services>(
  identity: ERSCIdentity<Services>,
): LoadingFactory<Services> => ({
  make: ({ render }) => {
    const LoadingComponent = () => render();
    return attachERSCMember(LoadingComponent, identity, 'Loading');
  },
});
