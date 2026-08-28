import { Layer, type Types } from 'effect';
import type { HttpRouter } from 'effect/unstable/http';

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
  readonly layer: Layer.Layer<Services, ApplicationError, HttpRouter.HttpRouter>;
  readonly routes: ReadonlyArray<CompiledDestination<Services>>;
};

class ApplicationDefinitionImpl<Services, ApplicationError> implements ApplicationDefinition<
  Services,
  ApplicationError
> {
  declare readonly [ApplicationContractTypeId]: {
    readonly error: Types.Covariant<ApplicationError>;
  };
  readonly [ERSCIdentityTypeId]: ERSCIdentity<Services>;
  readonly layer: Layer.Layer<Services, ApplicationError, HttpRouter.HttpRouter>;
  readonly routes: ReadonlyArray<CompiledDestination<Services>>;

  constructor(
    identity: ERSCIdentity<Services>,
    routes: ReadonlyArray<CompiledDestination<Services>>,
    layer: Layer.Layer<Services, ApplicationError, HttpRouter.HttpRouter>,
  ) {
    this[ERSCIdentityTypeId] = identity;
    this.layer = layer;
    this.routes = routes;
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

type ApplicationLayerOptions<Services, ApplicationError> = [Services] extends [never]
  ? {
      readonly layer?: Layer.Layer<Services, ApplicationError, HttpRouter.HttpRouter>;
    }
  : {
      readonly layer: Layer.Layer<Services, ApplicationError, HttpRouter.HttpRouter>;
    };

export type ERSCApplicationOptions<
  Services,
  Definition extends AnyRoutes<Services>,
  ApplicationError,
> = {
  readonly routes: Definition & ValidRootRoutes<Services, Definition>;
} & ApplicationLayerOptions<Services, ApplicationError>;

export type ERSCMake<Services> = <Definition extends AnyRoutes<Services>, ApplicationError = never>(
  options: ERSCApplicationOptions<Services, Definition, ApplicationError>,
) => ApplicationDefinition<Services, ApplicationError>;

function resolveApplicationLayer<Services, ApplicationError>(
  layer: Layer.Layer<Services, ApplicationError, HttpRouter.HttpRouter> | undefined,
): Layer.Layer<Services, ApplicationError, HttpRouter.HttpRouter>;
function resolveApplicationLayer(layer: Layer.Any | undefined): Layer.Any {
  return layer ?? Layer.empty;
}

export const makeApplication = <
  Services,
  Definition extends AnyRoutes<Services>,
  ApplicationError = never,
>(
  identity: ERSCIdentity<Services>,
  { layer, routes }: ERSCApplicationOptions<Services, Definition, ApplicationError>,
): ApplicationDefinition<Services, ApplicationError> => {
  if (getERSCIdentity(routes) !== identity) {
    throw new TypeError('Root Routes were created by a different ERSC module.');
  }

  return new ApplicationDefinitionImpl(
    identity,
    compileRouteGraph(routes),
    resolveApplicationLayer<Services, ApplicationError>(layer),
  );
};
