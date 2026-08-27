import { Effect, type Types } from 'effect';
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

const makeHttpMiddleware = <Services>(handler: RoutesMiddlewareHandler<Services>) =>
  HttpRouter.middleware(
    Effect.map(
      Effect.context<Services>(),
      (services) =>
        (httpEffect): RoutesHttpEffect =>
          handler(httpEffect).pipe(Effect.provideContext(services)),
    ),
  );

export type RoutesMiddlewareImplementationState<Services> = {
  readonly httpMiddleware: ReturnType<typeof makeHttpMiddleware<Services>>;
};

class RoutesMiddlewareImpl<Services>
  implements RoutesMiddleware<Services>, RoutesMiddlewareImplementationState<Services>
{
  declare readonly [RoutesMiddlewareContractTypeId]: typeof RoutesMiddlewareContractTypeId;
  readonly [ERSCIdentityTypeId]: ERSCIdentity<Services>;

  constructor(
    identity: ERSCIdentity<Services>,
    readonly httpMiddleware: RoutesMiddlewareImplementationState<Services>['httpMiddleware'],
  ) {
    this[ERSCIdentityTypeId] = identity;
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
    return new RoutesMiddlewareImpl(identity, makeHttpMiddleware(handler));
  };
