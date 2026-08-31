import type { ComponentFactory } from './component';
import { makeComponentFactory } from './component';
import { type ERSCMake, makeApplication } from './definition';
import {
  attachERSCMember,
  type ERSCIdentity,
  type ERSCMember,
  getERSCIdentity,
  makeERSCIdentity,
} from './ersc-identity';
import type { LayoutFactory } from './layout';
import { makeLayoutFactory } from './layout';
import type { LoadingFactory } from './loading';
import { makeLoadingFactory } from './loading';
import {
  type AnyMiddleware,
  getMiddlewareState,
  type MiddlewareFactory,
  type MiddlewareProvidedServices,
  type MiddlewareRequiredServices,
  makeMiddlewareFactory,
} from './middleware';
import type { PageFactory } from './page';
import { makePageFactory } from './page';
import type { RoutesFactory } from './routes';
import { makeRoutesFactory } from './routes';
import type { ServerFnFactory } from './server-fn';
import { makeServerFnFactory } from './server-fn';

type ApplicableMiddleware<AvailableServices, Value> = [
  Exclude<MiddlewareRequiredServices<Value>, AvailableServices>,
] extends [never]
  ? unknown
  : never;

export type ERSC<ApplicationServices, AvailableServices = ApplicationServices> = ERSCMember<
  ApplicationServices,
  'ERSC'
> & {
  readonly Component: ComponentFactory<ApplicationServices, AvailableServices>;
  readonly Layout: LayoutFactory<ApplicationServices, AvailableServices>;
  readonly Loading: LoadingFactory<ApplicationServices>;
  readonly Middleware: MiddlewareFactory<ApplicationServices, AvailableServices>;
  readonly Page: PageFactory<ApplicationServices, AvailableServices>;
  readonly Routes: RoutesFactory<ApplicationServices>;
  readonly ServerFn: ServerFnFactory<ApplicationServices, AvailableServices>;
  readonly make: ERSCMake<ApplicationServices>;
  readonly withMiddleware: <Value extends AnyMiddleware<ApplicationServices>>(
    middleware: Value & ApplicableMiddleware<AvailableServices, Value>,
  ) => ERSC<ApplicationServices, AvailableServices | MiddlewareProvidedServices<Value>>;
};

const makeERSC = <ApplicationServices, AvailableServices>(
  identity: ERSCIdentity<ApplicationServices>,
  middleware: ReadonlyArray<AnyMiddleware<ApplicationServices>>,
  allocateRouteScopeId: () => number,
  make: ERSCMake<ApplicationServices>,
): ERSC<ApplicationServices, AvailableServices> => {
  const withMiddleware = <Value extends AnyMiddleware<ApplicationServices>>(
    value: Value & ApplicableMiddleware<AvailableServices, Value>,
  ): ERSC<ApplicationServices, AvailableServices | MiddlewareProvidedServices<Value>> => {
    getMiddlewareState(value);
    if (getERSCIdentity(value) !== identity) {
      throw new TypeError('Middleware was created by a different ERSC module.');
    }
    if (middleware.includes(value)) {
      throw new TypeError('Middleware cannot appear twice in the same scope.');
    }

    return makeERSC(identity, Object.freeze([...middleware, value]), allocateRouteScopeId, make);
  };

  return Object.freeze(
    attachERSCMember(
      {
        Component: makeComponentFactory<ApplicationServices, AvailableServices>(
          identity,
          middleware,
        ),
        Layout: makeLayoutFactory<ApplicationServices, AvailableServices>(identity, middleware),
        Loading: makeLoadingFactory(identity),
        Middleware: makeMiddlewareFactory<ApplicationServices, AvailableServices>(identity),
        Page: makePageFactory<ApplicationServices, AvailableServices>(identity, middleware),
        Routes: makeRoutesFactory(identity, middleware, allocateRouteScopeId),
        ServerFn: makeServerFnFactory<ApplicationServices, AvailableServices>(identity, middleware),
        make,
        withMiddleware,
      },
      identity,
      'ERSC',
    ),
  );
};

const ersc = <Services = never>(): ERSC<Services> => {
  const identity = makeERSCIdentity<Services>();
  const make: ERSCMake<Services> = (options) => makeApplication(identity, options);
  let nextRouteScopeId = 0;
  const allocateRouteScopeId = () => {
    const scopeId = nextRouteScopeId;
    nextRouteScopeId += 1;
    return scopeId;
  };

  return makeERSC(identity, Object.freeze([]), allocateRouteScopeId, make);
};

export const Application = { ersc } as const;
