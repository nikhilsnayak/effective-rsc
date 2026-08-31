import { Effect } from 'effect';
import type { ReactNode } from 'react';

import { attachERSCMember, type ERSCIdentity, type ERSCMember } from './ersc-identity';
import type { AnyMiddleware } from './middleware';

export interface EffectComponent<Props, ApplicationServices> extends ERSCMember<
  ApplicationServices,
  'Component'
> {
  (props: Props): Promise<Awaited<ReactNode>>;
}

type ComponentOptions<Props, Error, AvailableServices> = {
  readonly render: (props: Props) => Effect.Effect<Awaited<ReactNode>, Error, AvailableServices>;
};

export type ComponentFactory<ApplicationServices, AvailableServices> = {
  readonly make: <Props, Error>(
    options: ComponentOptions<Props, Error, AvailableServices>,
  ) => EffectComponent<Props, ApplicationServices>;
};

export const makeComponentFactory = <ApplicationServices, AvailableServices>(
  identity: ERSCIdentity<ApplicationServices>,
  middleware: ReadonlyArray<AnyMiddleware<ApplicationServices>>,
): ComponentFactory<ApplicationServices, AvailableServices> => {
  const make = <Props, Error>({
    render,
  }: ComponentOptions<Props, Error, AvailableServices>): EffectComponent<
    Props,
    ApplicationServices
  > => {
    const EffectComponent = (props: Props): Promise<Awaited<ReactNode>> =>
      identity.renderRuntime.run(
        'Component',
        Effect.suspend(() => render(props)),
        middleware,
      );

    return attachERSCMember(EffectComponent, identity, 'Component');
  };

  return { make };
};
