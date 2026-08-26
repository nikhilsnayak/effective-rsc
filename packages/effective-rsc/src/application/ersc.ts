import type { ComponentFactory } from './component';
import { makeComponentFactory } from './component';
import { type ERSCMake, makeApplication } from './definition';
import { attachERSCIdentity, type ERSCMember, makeERSCIdentity } from './ersc-identity';
import type { LayoutFactory } from './layout';
import { makeLayoutFactory } from './layout';
import type { LoadingFactory } from './loading';
import { makeLoadingFactory } from './loading';
import type { PageFactory } from './page';
import { makePageFactory } from './page';
import type { RoutesFactory } from './routes';
import { makeRoutesFactory } from './routes';
import type { ServerFnFactory } from './server-fn';
import { makeServerFnFactory } from './server-fn';

export type ERSC<Services> = ERSCMember<Services> & {
  readonly Component: ComponentFactory<Services>;
  readonly Layout: LayoutFactory<Services>;
  readonly Loading: LoadingFactory<Services>;
  readonly Page: PageFactory<Services>;
  readonly Routes: RoutesFactory<Services>;
  readonly ServerFn: ServerFnFactory<Services>;
  readonly make: ERSCMake<Services>;
};

const ersc = <Services = never>(): ERSC<Services> => {
  const identity = makeERSCIdentity<Services>();
  const make: ERSCMake<Services> = (options) => makeApplication(identity, options);

  return Object.freeze(
    attachERSCIdentity(
      {
        Component: makeComponentFactory(identity),
        Layout: makeLayoutFactory(identity),
        Loading: makeLoadingFactory(identity),
        Page: makePageFactory(identity),
        Routes: makeRoutesFactory(identity),
        ServerFn: makeServerFnFactory(identity),
        make,
      },
      identity,
    ),
  );
};

export const Application = { ersc } as const;
