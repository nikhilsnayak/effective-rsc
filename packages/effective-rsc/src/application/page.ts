import { Effect, Predicate, Schema, type Types } from 'effect';
import type { ReactNode } from 'react';

import { type ERSCIdentity, ERSCIdentityTypeId, type ERSCMember } from './ersc-identity';
import type { ValidRouteParamName } from './route-path';

declare const PageContractTypeId: unique symbol;

const PageDefinitionTypeId: unique symbol = Symbol.for('ersc/PageDefinition');

export type PageParamsSchema<Services> = Schema.ConstraintCodec<
  Readonly<Record<string, unknown>>,
  Readonly<Record<string, unknown>>,
  Services,
  unknown
>;

type PageParamKeys<ParamsSchema> = ParamsSchema extends { readonly Encoded: infer Encoded }
  ? Extract<keyof Encoded, string>
  : never;
type NonStringPageParamKeys<ParamsSchema> = ParamsSchema extends {
  readonly Encoded: infer Encoded;
}
  ? Exclude<keyof Encoded, string>
  : never;
type InvalidPageParamName<Name extends string> =
  Name extends ValidRouteParamName<Name> ? never : Name;
type InvalidPageParamValueKeys<ParamsSchema> = ParamsSchema extends {
  readonly Encoded: infer Encoded;
}
  ? {
      [Key in Extract<keyof Encoded, string>]-?: unknown extends Encoded[Key]
        ? never
        : [Extract<Encoded[Key], string>] extends [never]
          ? Key
          : never;
    }[Extract<keyof Encoded, string>]
  : never;
type InvalidPageParamsSchema<ParamsSchema> =
  | NonStringPageParamKeys<ParamsSchema>
  | InvalidPageParamName<PageParamKeys<ParamsSchema>>
  | InvalidPageParamValueKeys<ParamsSchema>;
type ValidPageParamsSchema<ParamsSchema> = [PageParamKeys<ParamsSchema>] extends [never]
  ? never
  : string extends PageParamKeys<ParamsSchema>
    ? never
    : [InvalidPageParamsSchema<ParamsSchema>] extends [never]
      ? unknown
      : never;

export type PageConcern<
  out ParamNames extends string,
  out Mode extends 'Parameterized' | 'Static',
> = {
  readonly [PageContractTypeId]: {
    readonly mode: Types.Covariant<Mode>;
    readonly paramNames: Types.Covariant<ParamNames>;
  };
};

export type PagePathParams = Readonly<Record<string, string | undefined>>;
export type PageRuntimeProps<ParamNames extends string = string> = {
  readonly params: Readonly<Record<ParamNames, string | undefined>>;
};
export type PageComponent<ParamNames extends string = string> = (
  props: PageRuntimeProps<ParamNames>,
) => Promise<Awaited<ReactNode>>;

export type StaticPageDefinition<Services> = ERSCMember<Services> & PageConcern<never, 'Static'>;
export type ParameterizedPageDefinition<
  Services,
  ParamNames extends string = string,
> = ERSCMember<Services> & PageConcern<ParamNames, 'Parameterized'>;
export type AnyPageDefinition<Services> =
  | StaticPageDefinition<Services>
  | ParameterizedPageDefinition<Services>;

export type PageImplementationState<Services> = {
  readonly component: PageComponent;
  readonly paramsSchema: PageParamsSchema<Services> | null;
};

class PageDefinitionImpl<
  Services,
  ParamNames extends string,
  Mode extends 'Parameterized' | 'Static',
  ParamsSchema extends PageParamsSchema<Services> | null,
>
  implements ERSCMember<Services>, PageConcern<ParamNames, Mode>
{
  declare readonly [PageContractTypeId]: {
    readonly mode: Types.Covariant<Mode>;
    readonly paramNames: Types.Covariant<ParamNames>;
  };
  readonly [PageDefinitionTypeId] = PageDefinitionTypeId;
  readonly [ERSCIdentityTypeId]: ERSCIdentity<Services>;
  readonly component: PageComponent;
  readonly paramsSchema: ParamsSchema;

  constructor(
    identity: ERSCIdentity<Services>,
    component: PageComponent,
    paramsSchema: ParamsSchema,
  ) {
    this[ERSCIdentityTypeId] = identity;
    this.component = component;
    this.paramsSchema = paramsSchema;
    Object.freeze(this);
  }
}

export const isPageDefinition = <Services>(
  value: unknown,
): value is AnyPageDefinition<Services> & PageImplementationState<Services> =>
  Predicate.hasProperty(value, PageDefinitionTypeId) &&
  value[PageDefinitionTypeId] === PageDefinitionTypeId;

export const getPageState = <Services>(
  page: AnyPageDefinition<Services>,
): PageImplementationState<Services> => {
  if (!isPageDefinition<Services>(page)) {
    throw new TypeError('Page must be created with ERSC.Page.make.');
  }
  return page;
};

type StaticPageOptions<Error, Services> = {
  readonly params?: never;
  readonly render: () => Effect.Effect<Awaited<ReactNode>, Error, Services>;
};
type ParameterizedPageOptions<ParamsSchema extends PageParamsSchema<Services>, Error, Services> = {
  readonly params: ParamsSchema;
  readonly render: (props: {
    readonly params: ParamsSchema['Type'];
  }) => Effect.Effect<Awaited<ReactNode>, Error, Services>;
};

export type PageFactory<Services> = {
  readonly make: {
    <ParamsSchema extends PageParamsSchema<Services>, Error>(
      options: ParameterizedPageOptions<ParamsSchema, Error, Services> &
        ValidPageParamsSchema<ParamsSchema>,
    ): ParameterizedPageDefinition<Services, PageParamKeys<ParamsSchema>>;
    <Error>(options: StaticPageOptions<Error, Services>): StaticPageDefinition<Services>;
  };
};

export const makePageFactory = <Services>(
  identity: ERSCIdentity<Services>,
): PageFactory<Services> => {
  function make<ParamsSchema extends PageParamsSchema<Services>, Error>(
    options: ParameterizedPageOptions<ParamsSchema, Error, Services> &
      ValidPageParamsSchema<ParamsSchema>,
  ): ParameterizedPageDefinition<Services, PageParamKeys<ParamsSchema>>;
  function make<Error>(options: StaticPageOptions<Error, Services>): StaticPageDefinition<Services>;
  function make<Error>(
    options:
      | Omit<StaticPageOptions<Error, Services>, 'params'>
      | ParameterizedPageOptions<PageParamsSchema<Services>, Error, Services>,
  ): AnyPageDefinition<Services> {
    if ('params' in options) {
      const { params: paramsSchema, render } = options;
      const decodeParams = Schema.decodeUnknownEffect(paramsSchema);
      const component: PageComponent = ({ params }) =>
        identity.requestRuntime.run(
          decodeParams(params).pipe(
            Effect.flatMap((decodedParams) =>
              Effect.suspend(() => render({ params: decodedParams })),
            ),
          ),
        );
      return new PageDefinitionImpl<
        Services,
        PageParamKeys<typeof paramsSchema>,
        'Parameterized',
        typeof paramsSchema
      >(identity, component, paramsSchema);
    }

    const { render } = options;
    const component: PageComponent = () => identity.requestRuntime.run(Effect.suspend(render));
    return new PageDefinitionImpl<Services, never, 'Static', null>(identity, component, null);
  }

  return { make };
};
