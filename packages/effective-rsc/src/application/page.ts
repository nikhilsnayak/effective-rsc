import { Effect, Predicate } from 'effect';
import type { ReactNode } from 'react';

import { attachERSCIdentity, type ERSCIdentity, type ERSCMember } from './ersc-identity';

const PageTypeId: unique symbol = Symbol.for('effective-rsc/PageConcern');

export type PageConcern = {
  readonly [PageTypeId]: typeof PageTypeId;
};

export const isPageConcern = (value: unknown): value is PageConcern =>
  Predicate.hasProperty(value, PageTypeId) && value[PageTypeId] === PageTypeId;

export interface PageComponent<Services> extends PageConcern, ERSCMember<Services> {
  (): Promise<Awaited<ReactNode>>;
}

type PageOptions<Error, Services> = {
  readonly render: () => Effect.Effect<Awaited<ReactNode>, Error, Services>;
};

export type PageFactory<Services> = {
  readonly make: <Error>(options: PageOptions<Error, Services>) => PageComponent<Services>;
};

export const makePageFactory = <Services>(
  identity: ERSCIdentity<Services>,
): PageFactory<Services> => ({
  make: ({ render }) => {
    const PageComponent = () => identity.requestRuntime.run(Effect.suspend(render));

    const concern: PageConcern = { [PageTypeId]: PageTypeId };
    return attachERSCIdentity(Object.assign(PageComponent, concern), identity);
  },
});
