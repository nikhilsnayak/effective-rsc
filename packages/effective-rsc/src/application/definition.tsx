import { Layer, type Types } from 'effect';
import type { HttpRouter } from 'effect/unstable/http';

import {
  type ERSCIdentity,
  ERSCIdentityTypeId,
  ERSCMemberKindTypeId,
  type ERSCStatefulMember,
  ERSCStateTypeId,
  getERSCIdentity,
  isERSCMember,
} from './ersc-identity';
import { type CompiledRouteGraph, compileRouteGraph } from './route-graph';
import type { AbsolutePath, ReservedRoutePath } from './route-path';
import { type AnyRoutes, type RoutesHasLayout, type RoutesPaths } from './routes';

declare const ApplicationContractTypeId: unique symbol;

export interface ApplicationDefinition<
  Services,
  out ApplicationError = never,
> extends ERSCStatefulMember<
  Services,
  'Application',
  ApplicationImplementationState<Services, ApplicationError>
> {
  readonly [ApplicationContractTypeId]: {
    readonly error: Types.Covariant<ApplicationError>;
  };
}

export type ApplicationImplementationState<Services, ApplicationError> = {
  readonly layer: Layer.Layer<Services, ApplicationError, HttpRouter.HttpRouter>;
  readonly routes: CompiledRouteGraph<Services>;
};

class ApplicationDefinitionImpl<Services, ApplicationError> implements ApplicationDefinition<
  Services,
  ApplicationError
> {
  declare readonly [ApplicationContractTypeId]: {
    readonly error: Types.Covariant<ApplicationError>;
  };
  readonly [ERSCIdentityTypeId]: ERSCIdentity<Services>;
  readonly [ERSCMemberKindTypeId] = 'Application' as const;
  get [ERSCStateTypeId](): ApplicationImplementationState<Services, ApplicationError> {
    return this;
  }
  readonly layer: Layer.Layer<Services, ApplicationError, HttpRouter.HttpRouter>;
  readonly routes: CompiledRouteGraph<Services>;

  constructor(
    identity: ERSCIdentity<Services>,
    routes: CompiledRouteGraph<Services>,
    layer: Layer.Layer<Services, ApplicationError, HttpRouter.HttpRouter>,
  ) {
    this[ERSCIdentityTypeId] = identity;
    this.layer = layer;
    this.routes = routes;
    Object.defineProperties(this, {
      [ERSCIdentityTypeId]: { configurable: false, writable: false },
      layer: { configurable: false, writable: false },
      routes: { configurable: false, writable: false },
    });
  }
}

export const getApplicationState = <Services, ApplicationError>(
  application: ApplicationDefinition<Services, ApplicationError>,
): ApplicationImplementationState<Services, ApplicationError> => {
  if (!isERSCMember(application, 'Application')) {
    throw new TypeError('Application must be created with ERSC.make.');
  }
  return application[ERSCStateTypeId];
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
