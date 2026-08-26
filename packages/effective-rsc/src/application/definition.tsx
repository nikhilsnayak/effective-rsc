import { Layer, type Types } from 'effect';

import {
  type ERSCIdentity,
  ERSCIdentityTypeId,
  type ERSCMember,
  getERSCIdentity,
} from './ersc-identity';
import { type CompiledDestination, compileRouteGraph } from './route-graph';
import type { AbsolutePath, ReservedRoutePath } from './route-path';
import { type AnyRoutes, type RoutesHasLayout, type RoutesPaths } from './routes';

declare const ApplicationContractTypeId: unique symbol;

export interface ApplicationDefinition<
  Services,
  out ApplicationError = never,
> extends ERSCMember<Services> {
  readonly [ApplicationContractTypeId]: {
    readonly error: Types.Covariant<ApplicationError>;
  };
}

export type ApplicationImplementationState<Services, ApplicationError> = {
  readonly [ERSCIdentityTypeId]: ERSCIdentity<Services>;
  readonly routes: ReadonlyArray<CompiledDestination<Services>>;
  readonly servicesLayer: Layer.Layer<Services, ApplicationError>;
};

class ApplicationDefinitionImpl<Services, ApplicationError> implements ApplicationDefinition<
  Services,
  ApplicationError
> {
  declare readonly [ApplicationContractTypeId]: {
    readonly error: Types.Covariant<ApplicationError>;
  };
  readonly [ERSCIdentityTypeId]: ERSCIdentity<Services>;

  constructor(
    identity: ERSCIdentity<Services>,
    readonly routes: ReadonlyArray<CompiledDestination<Services>>,
    readonly servicesLayer: Layer.Layer<Services, ApplicationError>,
  ) {
    this[ERSCIdentityTypeId] = identity;
  }
}

const isApplicationImplementation = <Services, ApplicationError>(
  application: ApplicationDefinition<Services, ApplicationError>,
): application is ApplicationDefinition<Services, ApplicationError> &
  ApplicationDefinitionImpl<Services, ApplicationError> =>
  application instanceof ApplicationDefinitionImpl;

export const getApplicationState = <Services, ApplicationError>(
  application: ApplicationDefinition<Services, ApplicationError>,
): ApplicationImplementationState<Services, ApplicationError> => {
  if (!isApplicationImplementation(application)) {
    throw new TypeError('Application must be created with ERSC.make.');
  }
  return application;
};

export type ApplicationServices<Application> =
  Application extends ApplicationDefinition<infer Services, infer _ApplicationError>
    ? Services
    : never;

type ValidRootRoutes<Services, Definition extends AnyRoutes<Services>> =
  RoutesHasLayout<Definition> extends true
    ? [RoutesPaths<Definition>] extends [never]
      ? never
      : [ReservedRoutes<RoutesPaths<Definition>>] extends [never]
        ? unknown
        : never
    : never;

type ReservedRoutes<Paths> = Paths extends AbsolutePath ? ReservedRoutePath<Paths> : never;

type ServicesLayerOptions<Services, ApplicationError> = [Services] extends [never]
  ? { readonly servicesLayer?: Layer.Layer<never, ApplicationError> }
  : { readonly servicesLayer: Layer.Layer<Services, ApplicationError> };

export type ERSCApplicationOptions<
  Services,
  Definition extends AnyRoutes<Services>,
  ApplicationError,
> = {
  readonly routes: Definition & ValidRootRoutes<Services, Definition>;
} & ServicesLayerOptions<Services, ApplicationError>;

export type ERSCMake<Services> = <Definition extends AnyRoutes<Services>, ApplicationError = never>(
  options: ERSCApplicationOptions<Services, Definition, ApplicationError>,
) => ApplicationDefinition<Services, ApplicationError>;

function resolveServicesLayer<Services, ApplicationError>(
  servicesLayer:
    | Layer.Layer<Services, ApplicationError>
    | Layer.Layer<never, ApplicationError>
    | undefined,
): Layer.Layer<Services, ApplicationError>;
function resolveServicesLayer(servicesLayer: Layer.Any | undefined): Layer.Any {
  return servicesLayer ?? Layer.empty;
}

export const makeApplication = <
  Services,
  Definition extends AnyRoutes<Services>,
  ApplicationError = never,
>(
  identity: ERSCIdentity<Services>,
  { routes, servicesLayer }: ERSCApplicationOptions<Services, Definition, ApplicationError>,
): ApplicationDefinition<Services, ApplicationError> => {
  if (getERSCIdentity(routes) !== identity) {
    throw new TypeError('Root Routes were created by a different ERSC module.');
  }

  return new ApplicationDefinitionImpl(
    identity,
    compileRouteGraph(routes),
    resolveServicesLayer<Services, ApplicationError>(servicesLayer),
  );
};
