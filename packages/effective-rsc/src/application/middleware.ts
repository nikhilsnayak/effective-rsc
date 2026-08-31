import { type Effect, type Types } from 'effect';
import { HttpRouter, type HttpServerResponse } from 'effect/unstable/http';

import {
  type ERSCIdentity,
  ERSCIdentityTypeId,
  isERSCMember,
  ERSCMemberKindTypeId,
  type ERSCStatefulMember,
  ERSCStateTypeId,
} from './ersc-identity';

type MiddlewareConfig = {
  readonly provides?: unknown;
};

type MiddlewareProvides<Config extends MiddlewareConfig> = Config extends {
  readonly provides: infer Provides;
}
  ? Provides
  : never;

type MiddlewareHandler<AvailableServices, Provides> = <Error, RemainingServices>(
  httpEffect: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    Error,
    Provides | RemainingServices
  >,
) => Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  Error,
  AvailableServices | HttpRouter.Provided | RemainingServices
>;

export interface Middleware<
  ApplicationServices,
  out RequiredServices,
  out ProvidedServices,
> extends ERSCStatefulMember<
  ApplicationServices,
  'Middleware',
  MiddlewareImplementationState<RequiredServices, ProvidedServices>
> {}

export type AnyMiddleware<ApplicationServices> = Middleware<ApplicationServices, unknown, unknown>;

type HttpMiddleware<RequiredServices, ProvidedServices> = HttpRouter.Middleware<{
  readonly error: never;
  readonly handles: never;
  readonly layerError: never;
  readonly layerRequires: never;
  readonly provides: ProvidedServices;
  readonly requires: Exclude<RequiredServices, HttpRouter.Provided>;
}>;

export type MiddlewareImplementationState<RequiredServices, ProvidedServices> = {
  // Page GET/HEAD composes the native descriptor so Effect HTTP retains routing semantics such as
  // HEAD fallback. Server Function POST keeps the handler because its scope is known only after
  // React decodes the invoked reference.
  readonly handler: MiddlewareHandler<RequiredServices, ProvidedServices>;
  readonly httpMiddleware: HttpMiddleware<RequiredServices, ProvidedServices>;
};

class MiddlewareImpl<ApplicationServices, RequiredServices, ProvidedServices>
  implements
    Middleware<ApplicationServices, RequiredServices, ProvidedServices>,
    MiddlewareImplementationState<RequiredServices, ProvidedServices>
{
  readonly [ERSCIdentityTypeId]: ERSCIdentity<ApplicationServices>;
  readonly [ERSCMemberKindTypeId] = 'Middleware' as const;
  get [ERSCStateTypeId](): MiddlewareImplementationState<RequiredServices, ProvidedServices> {
    return this;
  }
  readonly handler: MiddlewareHandler<RequiredServices, ProvidedServices>;
  readonly httpMiddleware: HttpMiddleware<RequiredServices, ProvidedServices>;

  constructor(
    identity: ERSCIdentity<ApplicationServices>,
    handler: MiddlewareHandler<RequiredServices, ProvidedServices>,
    httpMiddleware: HttpMiddleware<RequiredServices, ProvidedServices>,
  ) {
    this[ERSCIdentityTypeId] = identity;
    this.handler = handler;
    this.httpMiddleware = httpMiddleware;
    Object.freeze(this);
  }
}

export const getMiddlewareState = <ApplicationServices, RequiredServices, ProvidedServices>(
  middleware: Middleware<ApplicationServices, RequiredServices, ProvidedServices>,
): MiddlewareImplementationState<RequiredServices, ProvidedServices> => {
  if (!isERSCMember(middleware, 'Middleware')) {
    throw new TypeError('Middleware must be created with ERSC.Middleware.make.');
  }
  return middleware[ERSCStateTypeId];
};

export const getScopedMiddlewareHandler = <ApplicationServices>(
  middleware: AnyMiddleware<ApplicationServices>,
): MiddlewareHandler<ApplicationServices | HttpRouter.Provided, never> =>
  getMiddlewareState(middleware).handler;

export const applyMiddleware = <ApplicationServices, Error, RemainingServices>(
  middleware: ReadonlyArray<AnyMiddleware<ApplicationServices>>,
  httpEffect: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    Error,
    ApplicationServices | HttpRouter.Provided | RemainingServices
  >,
) =>
  middleware.reduceRight(
    (current, value) => getScopedMiddlewareHandler(value)(current),
    httpEffect,
  );

export function getScopedHttpMiddleware<ApplicationServices>(
  middleware: AnyMiddleware<ApplicationServices>,
): HttpMiddleware<never, never>;
// AnyMiddleware erases each link's service contract after withMiddleware has validated the ordered
// chain. Callers must compose that complete chain inside the application and request context; the
// returned native descriptor retains the real runtime provisioning behavior.
export function getScopedHttpMiddleware(middleware: AnyMiddleware<unknown>) {
  return getMiddlewareState(middleware).httpMiddleware;
}

export type MiddlewareFactory<ApplicationServices, AvailableServices> = {
  readonly make: <Config extends MiddlewareConfig = {}>(
    handler: MiddlewareHandler<AvailableServices, MiddlewareProvides<Config>>,
  ) => Middleware<ApplicationServices, AvailableServices, MiddlewareProvides<Config>>;
};

export const makeMiddlewareFactory = <ApplicationServices, AvailableServices>(
  identity: ERSCIdentity<ApplicationServices>,
): MiddlewareFactory<ApplicationServices, AvailableServices> => ({
  make: <Config extends MiddlewareConfig = {}>(
    handler: MiddlewareHandler<AvailableServices, MiddlewareProvides<Config>>,
  ): Middleware<ApplicationServices, AvailableServices, MiddlewareProvides<Config>> => {
    type Provides = MiddlewareProvides<Config>;
    const httpHandler = (
      httpEffect: Effect.Effect<HttpServerResponse.HttpServerResponse, Types.unhandled, Provides>,
    ) => handler<Types.unhandled, never>(httpEffect);
    return new MiddlewareImpl(
      identity,
      handler,
      HttpRouter.middleware<{ provides: Provides }>()(httpHandler),
    );
  },
});

export type MiddlewareProvidedServices<Value> =
  Value extends Middleware<
    infer _ApplicationServices,
    infer _RequiredServices,
    infer ProvidedServices
  >
    ? ProvidedServices
    : never;

export type MiddlewareRequiredServices<Value> =
  Value extends Middleware<
    infer _ApplicationServices,
    infer RequiredServices,
    infer _ProvidedServices
  >
    ? RequiredServices
    : never;
