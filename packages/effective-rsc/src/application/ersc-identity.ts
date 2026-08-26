import type { Types } from 'effect';

import { makeRequestRuntimeContext, type RequestRuntimeContext } from './request-runtime';

declare const ERSCServicesTypeId: unique symbol;

export const ERSCIdentityTypeId: unique symbol = Symbol.for('effective-rsc/ERSCIdentity');

export type ERSCIdentity<Services> = {
  readonly [ERSCServicesTypeId]?: Types.Invariant<Services>;
  readonly requestRuntime: RequestRuntimeContext<Services>;
};

export type ERSCMember<Services> = {
  readonly [ERSCIdentityTypeId]: ERSCIdentity<Services>;
};

export const makeERSCIdentity = <Services>(): ERSCIdentity<Services> => ({
  requestRuntime: makeRequestRuntimeContext<Services>(),
});

export const attachERSCIdentity = <Member extends object, Services>(
  member: Member,
  identity: ERSCIdentity<Services>,
): Member & ERSCMember<Services> => Object.assign(member, { [ERSCIdentityTypeId]: identity });

export const getERSCIdentity = <Services>(member: ERSCMember<Services>): ERSCIdentity<Services> =>
  member[ERSCIdentityTypeId];
