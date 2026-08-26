import { Effect, Predicate, Schema, type Types } from 'effect';
import type { ReactNode } from 'react';

import { attachERSCIdentity, type ERSCIdentity, type ERSCMember } from './ersc-identity';
import type { ValidRouteParamName } from './route-path';

const PageTypeId: unique symbol = Symbol.for('effective-rsc/PageConcern');
export declare const PageParamsTypeId: unique symbol;

export type PageParamsSchema<Services> = Schema.ConstraintCodec<
  Readonly<Record<string, unknown>>,
  Readonly<Record<string, unknown>>,
  Services,
  unknown
>;

type PageParamKeys<ParamsSchema> = ParamsSchema extends {
  readonly Encoded: infer Encoded;
}
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

export type PageConcern<out ParamNames extends string> = {
  readonly [PageTypeId]: typeof PageTypeId;
  readonly [PageParamsTypeId]?: Types.Covariant<ParamNames>;
};

export const isPageConcern = (value: unknown): value is PageConcern<string> =>
  Predicate.hasProperty(value, PageTypeId) && value[PageTypeId] === PageTypeId;

export type PagePathParams = Readonly<Record<string, string | undefined>>;

export type PageRuntimeProps<ParamNames extends string = string> = {
  readonly params: Readonly<Record<ParamNames, string | undefined>>;
};

export type PageComponent<ParamNames extends string = string> = (
  props: PageRuntimeProps<ParamNames>,
) => Promise<Awaited<ReactNode>>;

type PageDefinitionBase<Services, ParamNames extends string> = PageConcern<ParamNames> &
  ERSCMember<Services> & {
    readonly component: PageComponent<ParamNames>;
  };

export type StaticPageDefinition<Services> = PageDefinitionBase<Services, never> & {
  readonly paramsSchema: null;
};

export type ParameterizedPageDefinition<
  Services,
  ParamNames extends string = string,
  ParamsSchema extends PageParamsSchema<Services> = PageParamsSchema<Services>,
> = PageDefinitionBase<Services, ParamNames> & {
  readonly paramsSchema: ParamsSchema;
};

export type AnyPageDefinition<Services> =
  | StaticPageDefinition<Services>
  | ParameterizedPageDefinition<Services>;

type StaticPageOptions<Error, Services> = {
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
    ): ParameterizedPageDefinition<Services, PageParamKeys<ParamsSchema>, ParamsSchema>;
    <Error>(options: StaticPageOptions<Error, Services>): StaticPageDefinition<Services>;
  };
};

export const makePageFactory = <Services>(
  identity: ERSCIdentity<Services>,
): PageFactory<Services> => {
  function make<ParamsSchema extends PageParamsSchema<Services>, Error>(
    options: ParameterizedPageOptions<ParamsSchema, Error, Services> &
      ValidPageParamsSchema<ParamsSchema>,
  ): ParameterizedPageDefinition<Services, PageParamKeys<ParamsSchema>, ParamsSchema>;
  function make<Error>(options: StaticPageOptions<Error, Services>): StaticPageDefinition<Services>;
  function make<Error>(
    options:
      | StaticPageOptions<Error, Services>
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

      const page: ParameterizedPageDefinition<Services> = attachERSCIdentity(
        {
          [PageTypeId]: PageTypeId,
          component,
          paramsSchema,
        },
        identity,
      );
      return Object.freeze(page);
    }

    const { render } = options;
    const component: PageComponent<never> = () =>
      identity.requestRuntime.run(Effect.suspend(render));

    const page: StaticPageDefinition<Services> = attachERSCIdentity(
      {
        [PageTypeId]: PageTypeId,
        component,
        paramsSchema: null,
      },
      identity,
    );
    return Object.freeze(page);
  }

  return { make };
};
