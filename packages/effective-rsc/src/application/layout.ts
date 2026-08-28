import { Effect, Predicate } from 'effect';
import type { ReactNode } from 'react';

import { attachERSCIdentity, type ERSCIdentity, type ERSCMember } from './ersc-identity';

const LayoutTypeId: unique symbol = Symbol.for('ersc/LayoutConcern');

export type LayoutConcern = {
  readonly [LayoutTypeId]: typeof LayoutTypeId;
};

export const isLayoutConcern = (value: unknown): value is LayoutConcern =>
  Predicate.hasProperty(value, LayoutTypeId) && value[LayoutTypeId] === LayoutTypeId;

type LayoutProps = {
  readonly children: Awaited<ReactNode>;
};

export interface LayoutComponent<Services> extends LayoutConcern, ERSCMember<Services> {
  (props: LayoutProps): Promise<Awaited<ReactNode>>;
}

type LayoutOptions<Error, Services> = {
  readonly render: (props: LayoutProps) => Effect.Effect<Awaited<ReactNode>, Error, Services>;
};

export type LayoutFactory<Services> = {
  readonly make: <Error>(options: LayoutOptions<Error, Services>) => LayoutComponent<Services>;
};

export const makeLayoutFactory = <Services>(
  identity: ERSCIdentity<Services>,
): LayoutFactory<Services> => ({
  make: ({ render }) => {
    const LayoutComponent = (props: LayoutProps) =>
      identity.requestRuntime.run(Effect.suspend(() => render(props)));

    const concern: LayoutConcern = { [LayoutTypeId]: LayoutTypeId };
    return attachERSCIdentity(Object.assign(LayoutComponent, concern), identity);
  },
});
