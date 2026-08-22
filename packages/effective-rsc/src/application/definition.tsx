import { Layer } from 'effect';
import { Suspense, type ReactNode } from 'react';

import type { LayoutComponent, LayoutConcern, LayoutProps } from './layout';
import type { LoadingComponent, LoadingConcern } from './loading';
import type { PageComponent, PageConcern } from './page';
import type { RenderRuntime } from './render-runtime';
import { RouteOutlet, RouteTree, type RouteNode } from './route-tree';
import type { SlotComponent, SlotConcern } from './slot';

type StaticPath = `/${string}`;

type SlotRoute = {
  readonly content: SlotConcern;
  readonly loading?: LoadingConcern;
};

type StaticRoute<SlotName extends string> = {
  readonly page: PageConcern;
  readonly slots: Readonly<Record<SlotName, SlotRoute | null>>;
};

type LayoutDefinition = LayoutConcern<string> & {
  readonly slots: ReadonlyArray<string>;
};

type RootRoute<RootLayout extends LayoutDefinition> = StaticRoute<LayoutSlotNames<RootLayout>> & {
  readonly layout: RootLayout;
  readonly loading?: LoadingConcern;
};

type LayoutSlotNames<RootLayout> =
  RootLayout extends LayoutConcern<infer SlotName> ? SlotName : never;

type RoutesInput<RootLayout extends LayoutDefinition> = {
  readonly '/': RootRoute<RootLayout>;
} & Readonly<Record<string, StaticRoute<LayoutSlotNames<RootLayout>>>>;

type ValidateRouteSlots<Route, SlotName extends string> = Route extends {
  readonly slots: infer Slots;
}
  ? {
      readonly slots: Slots & Readonly<Record<Exclude<keyof Slots, SlotName>, never>>;
    }
  : never;

type ValidateRoutes<Routes, RootLayout extends LayoutDefinition> = {
  readonly [Path in keyof Routes]: ValidateRouteSlots<Routes[Path], LayoutSlotNames<RootLayout>>;
};

type PageServices<Routes> = {
  readonly [Path in keyof Routes]: Routes[Path] extends {
    readonly page: PageComponent<infer Services>;
  }
    ? Services
    : never;
}[keyof Routes];

type SlotServices<Routes> = {
  readonly [Path in keyof Routes]: Routes[Path] extends {
    readonly slots: Readonly<Record<string, infer Slot>>;
  }
    ? SlotServicesFor<Slot>
    : never;
}[keyof Routes];

type SlotServicesFor<Slot> = Slot extends {
  readonly content: SlotComponent<infer Services>;
}
  ? Services
  : never;

type LayoutServices<Routes extends { readonly '/': object }> = Routes['/'] extends {
  readonly layout: infer Layout;
}
  ? Layout extends LayoutComponent<infer Services, infer _SlotName>
    ? Services
    : never
  : never;

type RouteServices<Routes extends { readonly '/': object }> =
  | LayoutServices<Routes>
  | PageServices<Routes>
  | SlotServices<Routes>;

const RootRouteFields = new Set(['layout', 'loading', 'page', 'slots']);
const StaticRouteFields = new Set(['page', 'slots']);

type ApplicationComponentProps<Services> = {
  readonly pathname: StaticPath;
  readonly runtime: RenderRuntime<Services>;
};

export type ApplicationComponent<Services> = (
  props: ApplicationComponentProps<Services>,
) => ReactNode;

export type ApplicationDefinition<Services, ApplicationError = never> = {
  readonly component: ApplicationComponent<Services>;
  readonly paths: ReadonlyArray<StaticPath>;
  readonly servicesLayer: Layer.Layer<Services, ApplicationError>;
};

export type ApplicationServices<Application> =
  Application extends ApplicationDefinition<infer Services, infer _ApplicationError>
    ? Services
    : never;

type ServicesLayerOptions<Services, ApplicationError> = [Services] extends [never]
  ? { readonly servicesLayer?: Layer.Layer<never, ApplicationError> }
  : { readonly servicesLayer: Layer.Layer<Services, ApplicationError> };

type ApplicationOptions<Routes extends { readonly '/': object }, ApplicationError> = {
  readonly routes: Routes;
} & ServicesLayerOptions<RouteServices<Routes>, ApplicationError>;

function resolveServicesLayer<Services, ApplicationError>(
  servicesLayer:
    | Layer.Layer<Services, ApplicationError>
    | Layer.Layer<never, ApplicationError>
    | undefined,
): Layer.Layer<Services, ApplicationError>;
function resolveServicesLayer(servicesLayer: Layer.Any | undefined): Layer.Any {
  return servicesLayer ?? Layer.empty;
}

const make = <
  const RootLayout extends LayoutDefinition,
  const Routes extends RoutesInput<RootLayout>,
  ApplicationError = never,
>(
  options: ApplicationOptions<Routes, ApplicationError> & {
    readonly routes: Routes &
      ValidateRoutes<Routes, RootLayout> & {
        readonly '/': { readonly layout: RootLayout };
      };
  },
): ApplicationDefinition<RouteServices<Routes>, ApplicationError> => {
  const { routes, servicesLayer } = options;
  const Layout = routes['/'].layout as unknown as LayoutComponent<
    LayoutServices<Routes>,
    LayoutSlotNames<RootLayout>
  >;
  const Loading = routes['/'].loading as LoadingComponent | undefined;
  const compiledRoutes = new Map<
    StaticPath,
    {
      readonly page: PageComponent<RouteServices<Routes>>;
      readonly slots: Readonly<
        Record<
          string,
          {
            readonly content: SlotComponent<RouteServices<Routes>>;
            readonly loading?: LoadingComponent;
          } | null
        >
      >;
    }
  >();
  const declaredSlots = new Set<string>(Layout.slots);

  for (const [pathname, route] of Object.entries(routes)) {
    if (!pathname.startsWith('/') || /[:*?#]/u.test(pathname)) {
      throw new TypeError(
        `Invalid static route path "${pathname}". Static routes must start with "/" and cannot contain ":", "*", "?", or "#".`,
      );
    }
    if (pathname === '/_ersc/assets' || pathname.startsWith('/_ersc/assets/')) {
      throw new TypeError(
        `Static route "${pathname}" uses the framework-reserved "/_ersc/assets" namespace.`,
      );
    }

    const allowedFields = pathname === '/' ? RootRouteFields : StaticRouteFields;
    const unsupportedField = Object.keys(route).find((field) => !allowedFields.has(field));
    if (unsupportedField) {
      throw new TypeError(
        `Static route "${pathname}" cannot define the "${unsupportedField}" concern. Only the root route can define layout and loading concerns.`,
      );
    }

    const slotNames = Object.keys(route.slots);
    const missingSlot = Layout.slots.find((slot) => !Object.hasOwn(route.slots, slot));
    if (missingSlot !== undefined) {
      throw new TypeError(`Static route "${pathname}" does not define slot "${missingSlot}".`);
    }
    const unsupportedSlot = slotNames.find((slot) => !declaredSlots.has(slot));
    if (unsupportedSlot !== undefined) {
      throw new TypeError(
        `Static route "${pathname}" defines undeclared layout slot "${unsupportedSlot}".`,
      );
    }

    compiledRoutes.set(pathname as StaticPath, {
      page: route.page as PageComponent<RouteServices<Routes>>,
      slots: route.slots as Readonly<
        Record<
          string,
          {
            readonly content: SlotComponent<RouteServices<Routes>>;
            readonly loading?: LoadingComponent;
          } | null
        >
      >,
    });
  }

  function RootComponent({ pathname, runtime }: ApplicationComponentProps<RouteServices<Routes>>) {
    const route = compiledRoutes.get(pathname);
    if (!route) {
      throw new TypeError(`No static route is registered for "${pathname}".`);
    }

    const Page = route.page;
    const pageId = `page:${pathname}`;
    const page = <Page key={pageId} runtime={runtime} />;
    const pageElement = Loading ? (
      <Suspense key={pageId} fallback={<Loading />}>
        {page}
      </Suspense>
    ) : (
      page
    );
    const pageNode: RouteNode = {
      id: pageId,
      element: pageElement,
      slots: {},
    };
    const childNodes: Record<string, RouteNode | null> = { children: pageNode };
    const layoutProps: Record<string, ReactNode> = {
      children: <RouteOutlet name='children' />,
    };

    for (const slotName of Layout.slots) {
      const slot = route.slots[slotName];
      layoutProps[slotName] = <RouteOutlet key={slotName} name={slotName} />;
      if (slot === null) {
        childNodes[slotName] = null;
        continue;
      }
      if (slot === undefined) {
        throw new TypeError(`Static route "${pathname}" does not define slot "${slotName}".`);
      }

      const SlotContent = slot.content;
      const SlotLoading = slot.loading;
      const slotId = `slot:${slotName}:${pathname}`;
      const content = <SlotContent key={slotId} runtime={runtime} />;
      childNodes[slotName] = {
        id: slotId,
        element: SlotLoading ? (
          <Suspense key={slotId} fallback={<SlotLoading />}>
            {content}
          </Suspense>
        ) : (
          content
        ),
        slots: {},
      };
    }

    const rootNode: RouteNode = {
      id: 'layout:root',
      element: (
        <Layout
          key='layout:root'
          runtime={runtime}
          {...(layoutProps as LayoutProps<LayoutSlotNames<RootLayout>>)}
        />
      ),
      slots: childNodes,
    };

    return <RouteTree root={rootNode} />;
  }

  return {
    component: RootComponent,
    paths: Object.freeze([...compiledRoutes.keys()]),
    servicesLayer: resolveServicesLayer<RouteServices<Routes>, ApplicationError>(servicesLayer),
  };
};

export const Application = { make } as const;
