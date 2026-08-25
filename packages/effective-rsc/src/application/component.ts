import { Effect } from 'effect';
import type { ReactNode } from 'react';

import { attachERSCIdentity, type ERSCIdentity, type ERSCMember } from './ersc-identity';

export interface EffectComponent<Props, Services> extends ERSCMember<Services> {
  (props: Props): Promise<Awaited<ReactNode>>;
}

type ComponentOptions<Props, Error, Services> = {
  readonly render: (props: Props) => Effect.Effect<Awaited<ReactNode>, Error, Services>;
};

export type ComponentFactory<Services> = {
  readonly make: <Props, Error>(
    options: ComponentOptions<Props, Error, Services>,
  ) => EffectComponent<Props, Services>;
};

export const makeComponentFactory = <Services>(
  identity: ERSCIdentity<Services>,
): ComponentFactory<Services> => {
  const make = <Props, Error>({
    render,
  }: ComponentOptions<Props, Error, Services>): EffectComponent<Props, Services> => {
    const EffectComponent = (props: Props): Promise<Awaited<ReactNode>> =>
      identity.requestRuntime.run(Effect.suspend(() => render(props)));

    return attachERSCIdentity(EffectComponent, identity);
  };

  return { make };
};
