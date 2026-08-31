import { Predicate, type Types } from 'effect';

import { makeRenderRuntimeContext, type RenderRuntimeContext } from './render-runtime';

declare const ERSCServicesTypeId: unique symbol;

export const ERSCIdentityTypeId: unique symbol = Symbol.for('ersc/ERSCIdentity');
export const ERSCMemberKindTypeId: unique symbol = Symbol.for('ersc/ERSCMemberKind');
export const ERSCStateTypeId: unique symbol = Symbol.for('ersc/ERSCState');

export type ERSCMemberKind =
  | 'Application'
  | 'Component'
  | 'ERSC'
  | 'Layout'
  | 'Loading'
  | 'Middleware'
  | 'Page'
  | 'Routes'
  | 'ServerFn';

export type ERSCIdentity<Services> = {
  readonly [ERSCServicesTypeId]?: Types.Invariant<Services>;
  readonly renderRuntime: RenderRuntimeContext;
};

type ERSCMemberKindMarker<Kind extends ERSCMemberKind> = {
  readonly [ERSCMemberKindTypeId]: Kind;
};

export type ERSCMember<
  Services,
  Kind extends ERSCMemberKind = ERSCMemberKind,
> = ERSCMemberKindMarker<Kind> & {
  readonly [ERSCIdentityTypeId]: ERSCIdentity<Services>;
};

export type ERSCStatefulMember<Services, Kind extends ERSCMemberKind, State> = ERSCMember<
  Services,
  Kind
> & {
  readonly [ERSCStateTypeId]: State;
};

export const makeERSCIdentity = <Services>(): ERSCIdentity<Services> => ({
  renderRuntime: makeRenderRuntimeContext(),
});

export const attachERSCMember = <
  Member extends object,
  Services,
  const Kind extends ERSCMemberKind,
>(
  member: Member,
  identity: ERSCIdentity<Services>,
  kind: Kind,
): Member & ERSCMember<Services, Kind> =>
  Object.assign(member, { [ERSCIdentityTypeId]: identity, [ERSCMemberKindTypeId]: kind });

export const isERSCMember = <const Kind extends ERSCMemberKind>(
  value: unknown,
  kind: Kind,
): value is ERSCMemberKindMarker<Kind> =>
  Predicate.hasProperty(value, ERSCMemberKindTypeId) && value[ERSCMemberKindTypeId] === kind;

export const getERSCIdentity = <Services>(member: ERSCMember<Services>): ERSCIdentity<Services> =>
  member[ERSCIdentityTypeId];
