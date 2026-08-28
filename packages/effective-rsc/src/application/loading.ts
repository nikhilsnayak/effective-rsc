import { type Effect, Predicate } from 'effect';
import type { ReactNode } from 'react';

import { attachERSCIdentity, type ERSCIdentity, type ERSCMember } from './ersc-identity';

const LoadingTypeId: unique symbol = Symbol.for('ersc/LoadingConcern');

export type LoadingConcern = {
  readonly [LoadingTypeId]: typeof LoadingTypeId;
};

export const isLoadingConcern = (value: unknown): value is LoadingConcern =>
  Predicate.hasProperty(value, LoadingTypeId) && value[LoadingTypeId] === LoadingTypeId;

export interface LoadingComponent<Services> extends LoadingConcern, ERSCMember<Services> {
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
    const concern: LoadingConcern = { [LoadingTypeId]: LoadingTypeId };

    return attachERSCIdentity(Object.assign(LoadingComponent, concern), identity);
  },
});
