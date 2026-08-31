import { Effect } from 'effect';
import type { ReactNode } from 'react';

import { attachERSCMember, type ERSCIdentity, type ERSCMember } from './ersc-identity';
import type { AnyMiddleware } from './middleware';

type LayoutProps = {
  readonly children: Awaited<ReactNode>;
};

export interface LayoutComponent<ApplicationServices> extends ERSCMember<
  ApplicationServices,
  'Layout'
> {
  (props: LayoutProps): Promise<Awaited<ReactNode>>;
}

type LayoutOptions<Error, AvailableServices> = {
  readonly render: (
    props: LayoutProps,
  ) => Effect.Effect<Awaited<ReactNode>, Error, AvailableServices>;
};

export type LayoutFactory<ApplicationServices, AvailableServices> = {
  readonly make: <Error>(
    options: LayoutOptions<Error, AvailableServices>,
  ) => LayoutComponent<ApplicationServices>;
};

export const makeLayoutFactory = <ApplicationServices, AvailableServices>(
  identity: ERSCIdentity<ApplicationServices>,
  middleware: ReadonlyArray<AnyMiddleware<ApplicationServices>>,
): LayoutFactory<ApplicationServices, AvailableServices> => ({
  make: ({ render }) => {
    const LayoutComponent = (props: LayoutProps) =>
      identity.renderRuntime.run(
        'Layout',
        Effect.suspend(() => render(props)),
        middleware,
      );

    return attachERSCMember(LayoutComponent, identity, 'Layout');
  },
});
