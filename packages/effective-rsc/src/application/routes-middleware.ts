import type { Effect, Types } from 'effect';
import { HttpRouter, type HttpServerResponse } from 'effect/unstable/http';

import { type ERSCIdentity, ERSCIdentityTypeId, type ERSCMember } from './ersc-identity';

declare const RoutesMiddlewareContractTypeId: unique symbol;

export type RoutesHttpEffect = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  Types.unhandled,
  HttpRouter.Provided
>;

export type RoutesMiddlewareHandler<Services> = (
  httpEffect: RoutesHttpEffect,
) => Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  Types.unhandled,
  Services | HttpRouter.Provided
>;

export interface RoutesMiddleware<Services> extends ERSCMember<Services> {
  readonly [RoutesMiddlewareContractTypeId]: typeof RoutesMiddlewareContractTypeId;
}

export type RoutesMiddlewareOptions<Services> = {
  readonly handler: RoutesMiddlewareHandler<Services>;
};

type RoutesMiddlewareRequirements<Services> = Exclude<Services, HttpRouter.Provided>;

type RoutesHttpMiddleware<Services> = HttpRouter.Middleware<{
  readonly error: never;
  readonly handles: never;
  readonly layerError: never;
  readonly layerRequires: never;
  readonly provides: never;
  readonly requires: RoutesMiddlewareRequirements<Services>;
}>;

export type RoutesMiddlewareImplementationState<Services> = {
  readonly httpMiddleware: RoutesHttpMiddleware<Services>;
};

class RoutesMiddlewareImpl<Services>
  implements RoutesMiddleware<Services>, RoutesMiddlewareImplementationState<Services>
{
  declare readonly [RoutesMiddlewareContractTypeId]: typeof RoutesMiddlewareContractTypeId;
  readonly [ERSCIdentityTypeId]: ERSCIdentity<Services>;
  readonly httpMiddleware: RoutesMiddlewareImplementationState<Services>['httpMiddleware'];

  constructor(
    identity: ERSCIdentity<Services>,
    httpMiddleware: RoutesMiddlewareImplementationState<Services>['httpMiddleware'],
  ) {
    this[ERSCIdentityTypeId] = identity;
    this.httpMiddleware = httpMiddleware;
    Object.freeze(this);
  }
}

export const isRoutesMiddleware = (value: unknown): boolean =>
  value instanceof RoutesMiddlewareImpl;

const isRoutesMiddlewareImplementation = <Services>(
  middleware: RoutesMiddleware<Services>,
): middleware is RoutesMiddleware<Services> & RoutesMiddlewareImplementationState<Services> =>
  middleware instanceof RoutesMiddlewareImpl;

export const getRoutesMiddlewareState = <Services>(
  middleware: RoutesMiddleware<Services>,
): RoutesMiddlewareImplementationState<Services> => {
  if (!isRoutesMiddlewareImplementation(middleware)) {
    throw new TypeError('Routes middleware must be created with ERSC.Routes.middleware.');
  }
  return middleware;
};

export const makeRoutesMiddlewareFactory =
  <Services>(identity: ERSCIdentity<Services>) =>
  ({ handler }: RoutesMiddlewareOptions<Services>): RoutesMiddleware<Services> => {
    if (typeof handler !== 'function') {
      throw new TypeError('Routes middleware handler must be a function.');
    }
    return new RoutesMiddlewareImpl(identity, HttpRouter.middleware(handler));
  };
