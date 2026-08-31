import { Effect, Schema, type Types } from 'effect';
import type { ReactNode } from 'react';

import {
  type ERSCIdentity,
  ERSCIdentityTypeId,
  isERSCMember,
  ERSCMemberKindTypeId,
  type ERSCStatefulMember,
  ERSCStateTypeId,
} from './ersc-identity';
import type { AnyMiddleware } from './middleware';
import type { ValidRouteParamName } from './route-path';

declare const PageContractTypeId: unique symbol;

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

export type StaticPageDefinition<Services> = ERSCStatefulMember<
  Services,
  'Page',
  PageImplementationState
> &
  PageConcern<never, 'Static'>;
export type ParameterizedPageDefinition<
  Services,
  ParamNames extends string = string,
> = ERSCStatefulMember<Services, 'Page', PageImplementationState> &
  PageConcern<ParamNames, 'Parameterized'>;
export type AnyPageDefinition<Services> =
  | StaticPageDefinition<Services>
  | ParameterizedPageDefinition<Services>;

export type PageImplementationState = {
  readonly component: PageComponent;
  readonly paramsSchema: Schema.Constraint | null;
};

class PageDefinitionImpl<
  Services,
  ParamNames extends string,
  Mode extends 'Parameterized' | 'Static',
  ParamsSchema extends Schema.Constraint | null,
>
  implements
    ERSCStatefulMember<Services, 'Page', PageImplementationState>,
    PageConcern<ParamNames, Mode>
{
  declare readonly [PageContractTypeId]: {
    readonly mode: Types.Covariant<Mode>;
    readonly paramNames: Types.Covariant<ParamNames>;
  };
  readonly [ERSCIdentityTypeId]: ERSCIdentity<Services>;
  readonly [ERSCMemberKindTypeId] = 'Page' as const;
  get [ERSCStateTypeId](): PageImplementationState {
    return this;
  }
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

export const getPageState = <Services>(
  page: AnyPageDefinition<Services>,
): PageImplementationState => {
  if (!isERSCMember(page, 'Page')) {
    throw new TypeError('Page must be created with ERSC.Page.make.');
  }
  return page[ERSCStateTypeId];
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

export type PageFactory<ApplicationServices, AvailableServices> = {
  readonly make: {
    <ParamsSchema extends PageParamsSchema<AvailableServices>, Error>(
      options: ParameterizedPageOptions<ParamsSchema, Error, AvailableServices> &
        ValidPageParamsSchema<ParamsSchema>,
    ): ParameterizedPageDefinition<ApplicationServices, PageParamKeys<ParamsSchema>>;
    <Error>(
      options: StaticPageOptions<Error, AvailableServices>,
    ): StaticPageDefinition<ApplicationServices>;
  };
};

export const makePageFactory = <ApplicationServices, AvailableServices>(
  identity: ERSCIdentity<ApplicationServices>,
  middleware: ReadonlyArray<AnyMiddleware<ApplicationServices>>,
): PageFactory<ApplicationServices, AvailableServices> => {
  function make<ParamsSchema extends PageParamsSchema<AvailableServices>, Error>(
    options: ParameterizedPageOptions<ParamsSchema, Error, AvailableServices> &
      ValidPageParamsSchema<ParamsSchema>,
  ): ParameterizedPageDefinition<ApplicationServices, PageParamKeys<ParamsSchema>>;
  function make<Error>(
    options: StaticPageOptions<Error, AvailableServices>,
  ): StaticPageDefinition<ApplicationServices>;
  function make<Error>(
    options:
      | Omit<StaticPageOptions<Error, AvailableServices>, 'params'>
      | ParameterizedPageOptions<PageParamsSchema<AvailableServices>, Error, AvailableServices>,
  ): AnyPageDefinition<ApplicationServices> {
    if ('params' in options) {
      const { params: paramsSchema, render } = options;
      const decodeParams = Schema.decodeUnknownEffect(paramsSchema);
      const component: PageComponent = ({ params }) =>
        identity.renderRuntime.run(
          'Page',
          decodeParams(params).pipe(
            Effect.flatMap((decodedParams) =>
              Effect.suspend(() => render({ params: decodedParams })),
            ),
          ),
          middleware,
        );
      return new PageDefinitionImpl<
        ApplicationServices,
        PageParamKeys<typeof paramsSchema>,
        'Parameterized',
        typeof paramsSchema
      >(identity, component, paramsSchema);
    }

    const { render } = options;
    const component: PageComponent = () =>
      identity.renderRuntime.run('Page', Effect.suspend(render), middleware);
    return new PageDefinitionImpl<ApplicationServices, never, 'Static', null>(
      identity,
      component,
      null,
    );
  }

  return { make };
};
