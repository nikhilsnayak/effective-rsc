import { describe, expect, it } from '@effect/vitest';
import { Context, Effect, Layer, Option, Schema } from 'effect';
import { isValidElement, Suspense, type ReactElement, type ReactNode } from 'react';

import {
  type ApplicationDefinition,
  type ApplicationServices,
  getApplicationState,
} from '../../src/application/definition';
import { Application } from '../../src/application/ersc';
import {
  type AnyPageDefinition,
  getPageState,
  type PagePathParams,
} from '../../src/application/page';
import type { CompiledDestination } from '../../src/application/route-graph';
import type { AbsolutePath } from '../../src/application/route-path';
import { RouteOutlet } from '../../src/client/route-tree';
import { renderRouteTree } from '../../src/rsc/render-route-tree';
import type { RouteTreeModel } from '../../src/rsc/route-tree';

const asElement = <Props,>(node: ReactNode): ReactElement<Props> => {
  if (!isValidElement<Props>(node)) {
    throw new Error('Expected a React element.');
  }
  return node;
};

const requiredChild = (node: RouteTreeModel) => {
  if (node.child === null) {
    throw new Error(`Expected route node "${node.id}" to contain a child.`);
  }
  return node.child;
};

const findDestination = <Services,>(
  routes: ReadonlyArray<CompiledDestination<Services>>,
  pattern: AbsolutePath,
) => {
  const destination = routes.find((route) => route.pattern === pattern);
  if (destination === undefined) {
    throw new Error(`Expected a compiled destination for "${pattern}".`);
  }
  return destination;
};

const renderApplicationRoute = <Services,>(
  routes: ReadonlyArray<CompiledDestination<Services>>,
  pattern: AbsolutePath,
  pathname: AbsolutePath = pattern,
  pathParams: PagePathParams = {},
) => renderRouteTree({ destination: findDestination(routes, pattern), pathname, pathParams });

const applicationRoutes = <Services, ApplicationError>(
  application: ApplicationDefinition<Services, ApplicationError>,
) => getApplicationState(application).routes;

const pageComponent = <Services,>(page: AnyPageDefinition<Services>) =>
  getPageState(page).component;

const ERSC = Application.ersc();

const RootLayout = ERSC.Layout.make({
  render: ({ children }) =>
    Effect.succeed(
      <html lang='en'>
        <body>{children}</body>
      </html>,
    ),
});
const ScheduleLayout = ERSC.Layout.make({
  render: ({ children }) =>
    Effect.succeed(
      <section>
        <aside>Schedule navigation</aside>
        {children}
      </section>,
    ),
});
const ScheduleLoading = ERSC.Loading.make({ render: () => <p>Loading schedule...</p> });
const HomePage = ERSC.Page.make({ render: () => Effect.succeed(<h1>Home</h1>) });
const SaturdayPage = ERSC.Page.make({ render: () => Effect.succeed(<h1>Saturday</h1>) });
const SundayPage = ERSC.Page.make({ render: () => Effect.succeed(<h1>Sunday</h1>) });

class LayoutService extends Context.Service<LayoutService, object>()(
  'effective-rsc/tests/application/LayoutService',
) {}

class PageService extends Context.Service<PageService, object>()(
  'effective-rsc/tests/application/PageService',
) {}

class NestedPageService extends Context.Service<NestedPageService, object>()(
  'effective-rsc/tests/application/NestedPageService',
) {}

class LayerDependency extends Context.Service<LayerDependency, object>()(
  'effective-rsc/tests/application/LayerDependency',
) {}

describe('ERSC.make', () => {
  it('renders a root Layout around its exact Page', () => {
    const App = ERSC.make({
      routes: ERSC.Routes.make({ layout: RootLayout }).page('/', HomePage),
    });
    const typecheckOpaqueApplication = () => {
      // @ts-expect-error Compiled routes are private to framework runtime modules.
      void App.routes;
      // @ts-expect-error The application Layer is private to framework runtime modules.
      void App.layer;
    };
    const rootNode = renderApplicationRoute(applicationRoutes(App), '/');
    const root = asElement<{ readonly children: ReactNode }>(rootNode.content);
    const pageNode = requiredChild(rootNode);

    expect(rootNode.id).not.toBe(pageNode.id);
    expect(root.type).toBe(RootLayout);
    expect(asElement(root.props.children).type).toBe(RouteOutlet);
    expect(asElement(pageNode.content).type).toBe(pageComponent(HomePage));
    expect(applicationRoutes(App).map(({ pattern }) => pattern)).toEqual(['/']);
    expect(typecheckOpaqueApplication).toBeTypeOf('function');
  });

  it('renders a dynamic route pattern with its concrete pathname and captured params', () => {
    const DayPage = ERSC.Page.make({
      params: Schema.Struct({ day: Schema.Literals(['saturday', 'sunday']) }),
      render: ({ params }) => Effect.succeed(<h1>{params.day}</h1>),
    });
    const App = ERSC.make({
      routes: ERSC.Routes.make({ layout: RootLayout }).page('/schedule/:day', DayPage),
    });
    const saturdayPage = requiredChild(
      renderApplicationRoute(applicationRoutes(App), '/schedule/:day', '/schedule/saturday', {
        day: 'saturday',
      }),
    );
    const sundayPage = requiredChild(
      renderApplicationRoute(applicationRoutes(App), '/schedule/:day', '/schedule/sunday', {
        day: 'sunday',
      }),
    );
    const saturdayElement = asElement<{
      readonly params: Readonly<Record<string, string | undefined>>;
    }>(saturdayPage.content);

    expect(applicationRoutes(App).map(({ pattern }) => pattern)).toEqual(['/schedule/:day']);
    expect(saturdayPage.id).not.toBe(sundayPage.id);
    expect(saturdayElement.type).toBe(pageComponent(DayPage));
    expect(saturdayElement.props.params).toEqual({ day: 'saturday' });
  });

  it('preserves Layout ancestry and places Loading below its owning Layout', () => {
    const scheduleRoutes = ERSC.Routes.make({
      layout: ScheduleLayout,
      loading: ScheduleLoading,
    })
      .page('/', SaturdayPage)
      .page('/day-two', SundayPage);
    const App = ERSC.make({
      routes: ERSC.Routes.make({ layout: RootLayout })
        .page('/', HomePage)
        .mount('/schedule', scheduleRoutes),
    });
    const sundayRootNode = renderApplicationRoute(applicationRoutes(App), '/schedule/day-two');
    const saturdayRootNode = renderApplicationRoute(applicationRoutes(App), '/schedule');
    const scheduleLayoutNode = requiredChild(sundayRootNode);
    const saturdayScheduleLayoutNode = requiredChild(saturdayRootNode);
    const loadingNode = requiredChild(scheduleLayoutNode);
    const saturdayLoadingNode = requiredChild(saturdayScheduleLayoutNode);
    const pageNode = requiredChild(loadingNode);
    const loadingBoundary = asElement<{
      readonly children: ReactNode;
      readonly fallback: ReactNode;
    }>(loadingNode.content);

    expect(applicationRoutes(App).map(({ pattern }) => pattern)).toEqual([
      '/',
      '/schedule',
      '/schedule/day-two',
    ]);
    expect(asElement(sundayRootNode.content).type).toBe(RootLayout);
    expect(scheduleLayoutNode.id).toBe(saturdayScheduleLayoutNode.id);
    expect(asElement(scheduleLayoutNode.content).type).toBe(ScheduleLayout);
    expect(loadingNode.id).not.toBe(saturdayLoadingNode.id);
    expect(loadingBoundary.type).toBe(Suspense);
    expect(asElement(loadingBoundary.props.fallback).type).toBe(ScheduleLoading);
    expect(asElement(loadingBoundary.props.children).type).toBe(RouteOutlet);
    expect(pageNode.id).not.toBe(loadingNode.id);
    expect(asElement(pageNode.content).type).toBe(pageComponent(SundayPage));
  });

  it('lets layoutless Routes group paths without adding a rendered node', () => {
    const groupedRoutes = ERSC.Routes.make().page('/', SaturdayPage).page('/day-two', SundayPage);
    const App = ERSC.make({
      routes: ERSC.Routes.make({ layout: RootLayout }).mount('/schedule', groupedRoutes),
    });
    const rootNode = renderApplicationRoute(applicationRoutes(App), '/schedule/day-two');
    const pageNode = requiredChild(rootNode);

    expect(asElement(pageNode.content).type).toBe(pageComponent(SundayPage));
  });

  it('supports a Loading scope without requiring a nested Layout', () => {
    const groupedRoutes = ERSC.Routes.make({ loading: ScheduleLoading }).page('/', SaturdayPage);
    const App = ERSC.make({
      routes: ERSC.Routes.make({ layout: RootLayout }).mount('/schedule', groupedRoutes),
    });
    const rootNode = renderApplicationRoute(applicationRoutes(App), '/schedule');
    const loadingNode = requiredChild(rootNode);
    const pageNode = requiredChild(loadingNode);

    expect(asElement(loadingNode.content).type).toBe(Suspense);
    expect(asElement(pageNode.content).type).toBe(pageComponent(SaturdayPage));
  });

  it('compiles one Routes value mounted at more than one prefix', () => {
    const sharedRoutes = ERSC.Routes.make({ layout: ScheduleLayout })
      .page('/', SaturdayPage)
      .page('/day-two', SundayPage);
    const App = ERSC.make({
      routes: ERSC.Routes.make({ layout: RootLayout })
        .page('/', HomePage)
        .mount('/saturday', sharedRoutes)
        .mount('/sunday', sharedRoutes),
    });
    const saturdayLayoutNode = requiredChild(
      renderApplicationRoute(applicationRoutes(App), '/saturday/day-two'),
    );
    const sundayLayoutNode = requiredChild(
      renderApplicationRoute(applicationRoutes(App), '/sunday/day-two'),
    );

    expect(applicationRoutes(App).map(({ pattern }) => pattern)).toEqual([
      '/',
      '/saturday',
      '/saturday/day-two',
      '/sunday',
      '/sunday/day-two',
    ]);
    expect(saturdayLayoutNode.id).not.toBe(sundayLayoutNode.id);
    expect(requiredChild(saturdayLayoutNode).id).not.toBe(requiredChild(sundayLayoutNode).id);
  });

  it('compiles Pages into matcher-neutral destinations', () => {
    const App = ERSC.make({
      routes: ERSC.Routes.make({ layout: RootLayout })
        .page('/', HomePage)
        .mount('/schedule', ERSC.Routes.make().page('/', SaturdayPage)),
    });

    expect(applicationRoutes(App).map(({ pattern }) => pattern)).toEqual(['/', '/schedule']);
    expect(applicationRoutes(App)[0]?.page.component).toBe(pageComponent(HomePage));
    expect(applicationRoutes(App)[1]?.page.component).toBe(pageComponent(SaturdayPage));
  });

  it('compiles inherited Routes middleware without adding React scopes', () => {
    const RootMiddleware = ERSC.Routes.middleware({ handler: (httpEffect) => httpEffect });
    const NestedMiddleware = ERSC.Routes.middleware({ handler: (httpEffect) => httpEffect });
    const App = ERSC.make({
      routes: ERSC.Routes.make({ layout: RootLayout, middleware: [RootMiddleware] })
        .page('/', HomePage)
        .mount(
          '/schedule',
          ERSC.Routes.make({ middleware: [NestedMiddleware] }).page('/', SaturdayPage),
        ),
    });
    const [home, schedule] = applicationRoutes(App);

    expect(home?.middleware).toEqual([RootMiddleware]);
    expect(schedule?.middleware).toEqual([RootMiddleware, NestedMiddleware]);
    expect(schedule?.scopes).toHaveLength(1);
    expect(Object.isFrozen(schedule?.middleware)).toBe(true);
  });

  it('rejects duplicate middleware inherited by one destination', () => {
    const RequireUser = ERSC.Routes.middleware({ handler: (httpEffect) => httpEffect });
    const routes = ERSC.Routes.make({ layout: RootLayout, middleware: [RequireUser] }).mount(
      '/account',
      ERSC.Routes.make({ middleware: [RequireUser] }).page('/', HomePage),
    );

    expect(() => ERSC.make({ routes })).toThrow(
      'Routes middleware for destination "/account" appears more than once',
    );
  });

  it('declares service contracts once and chooses their implementations at application assembly', () => {
    type AppServices = LayoutService | PageService | NestedPageService;
    const ServiceERSC = Application.ersc<AppServices>();
    const ServiceLayout = ServiceERSC.Layout.make({
      render: Effect.fnUntraced(function* ({ children }) {
        yield* LayoutService;
        return <>{children}</>;
      }),
    });
    const ServicePage = ServiceERSC.Page.make({
      render: Effect.fnUntraced(function* () {
        yield* PageService;
        return <h1>Home</h1>;
      }),
    });
    const ServiceNestedPage = ServiceERSC.Page.make({
      render: Effect.fnUntraced(function* () {
        yield* NestedPageService;
        return <h1>Nested</h1>;
      }),
    });
    const ApplicationLayer = Layer.mergeAll(
      Layer.succeed(LayoutService, LayoutService.of({})),
      Layer.succeed(PageService, PageService.of({})),
      Layer.succeed(NestedPageService, NestedPageService.of({})),
    );
    const App = ServiceERSC.make({
      routes: ServiceERSC.Routes.make({ layout: ServiceLayout })
        .page('/', ServicePage)
        .mount('/nested', ServiceERSC.Routes.make().page('/', ServiceNestedPage)),
      layer: ApplicationLayer,
    });
    type Services = ApplicationServices<typeof App>;
    const servicesAreCombined: [Services] extends [LayoutService | PageService | NestedPageService]
      ? [LayoutService | PageService | NestedPageService] extends [Services]
        ? true
        : false
      : false = true;

    expect(servicesAreCombined).toBe(true);
    expect(getApplicationState(App).layer).toBe(ApplicationLayer);
  });

  it('requires a root Layout, a reachable Page, and a closed implementation Layer', () => {
    const ServiceERSC = Application.ersc<PageService>();
    const ServiceRootLayout = ServiceERSC.Layout.make({
      render: ({ children }) => Effect.succeed(<html lang='en'>{children}</html>),
    });
    const ServicePage = ServiceERSC.Page.make({
      render: Effect.fnUntraced(function* () {
        yield* PageService;
        return <h1>Services</h1>;
      }),
    });
    const serviceRoutes = ServiceERSC.Routes.make({ layout: ServiceRootLayout }).page(
      '/',
      ServicePage,
    );
    const IncompleteApplicationLayer = Layer.effect(
      PageService,
      Effect.as(LayerDependency, PageService.of({})),
    );
    const typecheckInvalidApplications = () => {
      ERSC.make({
        // @ts-expect-error The application root must define a Layout.
        routes: ERSC.Routes.make().page('/', HomePage),
      });
      ERSC.make({
        // @ts-expect-error The application must contain at least one reachable Page.
        routes: ERSC.Routes.make({ layout: RootLayout }),
      });
      // @ts-expect-error The declared service universe requires an implementation Layer.
      ServiceERSC.make({ routes: serviceRoutes });
      ServiceERSC.make({
        routes: serviceRoutes,
        // @ts-expect-error The application Layer must have no remaining service requirements.
        layer: IncompleteApplicationLayer, // oxlint-disable-line effecttsgo/missing-layer-context -- intentional invalid Layer fixture
      });
    };

    expect(typecheckInvalidApplications).toBeTypeOf('function');
    expect(() =>
      ERSC.make({
        // @ts-expect-error Exercise runtime validation for a root without a Layout.
        routes: ERSC.Routes.make().page('/', HomePage),
      }),
    ).toThrow('must define a Layout');
    expect(() =>
      ERSC.make({
        // @ts-expect-error Exercise runtime validation for a root without a Page.
        routes: ERSC.Routes.make({ layout: RootLayout }),
      }),
    ).toThrow('must contain a Page');
  });

  it('rejects operations outside the declared service universe', () => {
    const NarrowERSC = Application.ersc<PageService>();
    const ServiceSchema = Schema.String.pipe(
      Schema.catchDecodingWithContext(() =>
        Effect.map(LayoutService, () => Option.some('fallback')),
      ),
    );
    const typecheckInvalidOperation = () => {
      NarrowERSC.Page.make({
        // @ts-expect-error LayoutService is not part of this application's declared contracts.
        // oxlint-disable-next-line effecttsgo/missing-effect-context -- intentional invalid Effect fixture
        render: Effect.fnUntraced(function* () {
          yield* LayoutService;
          return null;
        }),
      });
      NarrowERSC.Routes.middleware({
        handler: (httpEffect) =>
          // @ts-expect-error LayoutService is not part of this application's declared contracts.
          // oxlint-disable-next-line effecttsgo/missing-effect-context -- intentional invalid Effect fixture
          Effect.gen(function* () {
            yield* LayoutService;
            return yield* httpEffect;
          }),
      });
      NarrowERSC.Layout.make({
        // @ts-expect-error LayoutService is not part of this application's declared contracts.
        // oxlint-disable-next-line effecttsgo/missing-effect-context -- intentional invalid Effect fixture
        render: Effect.fnUntraced(function* ({ children }) {
          yield* LayoutService;
          return children;
        }),
      });
      NarrowERSC.Component.make({
        // @ts-expect-error LayoutService is not part of this application's declared contracts.
        // oxlint-disable-next-line effecttsgo/missing-effect-context -- intentional invalid Effect fixture
        render: Effect.fnUntraced(function* () {
          yield* LayoutService;
          return null;
        }),
      });
      NarrowERSC.ServerFn.make({
        input: Schema.String,
        // @ts-expect-error LayoutService is not part of this application's declared contracts.
        // oxlint-disable-next-line effecttsgo/missing-effect-context -- intentional invalid Effect fixture
        handler: Effect.fnUntraced(function* () {
          yield* LayoutService;
          return null;
        }),
      });
      NarrowERSC.ServerFn.make({
        // @ts-expect-error LayoutService required by schema decoding is outside this ERSC universe.
        input: ServiceSchema,
        handler: () => Effect.void,
      });
      NarrowERSC.Page.make({
        // @ts-expect-error LayoutService required by param decoding is outside this ERSC universe.
        params: Schema.Struct({ value: ServiceSchema }),
        render: () => Effect.succeed(null),
      });
    };

    expect(typecheckInvalidOperation).toBeTypeOf('function');
  });

  it('does not widen concerns across different service universes', () => {
    const NarrowERSC = Application.ersc<PageService>();
    const WideERSC = Application.ersc<PageService | LayoutService>();
    const NarrowPage = NarrowERSC.Page.make({ render: () => Effect.succeed(<h1>Narrow</h1>) });
    const typecheckInvalidConcern = () => {
      // @ts-expect-error An ERSC member belongs to one exact service universe.
      WideERSC.Routes.make().page('/', NarrowPage);
    };

    expect(typecheckInvalidConcern).toBeTypeOf('function');
  });

  it('rejects route concerns created by a different ERSC module', () => {
    const OtherERSC = Application.ersc();
    const OtherLayout = OtherERSC.Layout.make({
      render: ({ children }) => Effect.succeed(children),
    });
    const OtherLoading = OtherERSC.Loading.make({ render: () => <p>Loading...</p> });
    const OtherPage = OtherERSC.Page.make({ render: () => Effect.succeed(<h1>Other</h1>) });
    const OtherMiddleware = OtherERSC.Routes.middleware({
      handler: (httpEffect) => httpEffect,
    });
    const OtherRoutes = OtherERSC.Routes.make({ layout: OtherLayout }).page('/', OtherPage);

    expect(() => ERSC.Routes.make({ loading: OtherLoading })).toThrow(
      'Loading was created by a different ERSC module.',
    );
    expect(() =>
      ERSC.Routes.make({
        middleware: [OtherMiddleware],
      }),
    ).toThrow('Routes middleware was created by a different ERSC module.');
    expect(() =>
      ERSC.make({
        routes: ERSC.Routes.make({ layout: RootLayout }).page('/', OtherPage),
      }),
    ).toThrow('created by a different ERSC module');
    expect(() => ERSC.make({ routes: OtherRoutes })).toThrow(
      'Root Routes were created by a different ERSC module.',
    );
  });

  it('rejects same-ERSC members used as the wrong route concern', () => {
    const Leaf = ERSC.Component.make({ render: () => Effect.succeed(<p>Leaf</p>) });

    expect(() =>
      ERSC.Routes.make({
        // @ts-expect-error Loading is not a Layout concern.
        layout: ScheduleLoading,
      }),
    ).toThrow('Layout must be created with ERSC.Layout.make.');
    expect(() =>
      ERSC.Routes.make({
        // @ts-expect-error Layout is not a Loading concern.
        loading: RootLayout,
      }),
    ).toThrow('Loading must be created with ERSC.Loading.make.');
    expect(() =>
      ERSC.Routes.make().page(
        '/',
        // @ts-expect-error Component is not a Page concern.
        Leaf,
      ),
    ).toThrow('Page for "/" must be created with ERSC.Page.make.');
  });

  it('requires factory-created concerns', () => {
    const ArbitraryLayout = ({ children }: { readonly children: ReactNode }) => (
      <main>{children}</main>
    );
    const ArbitraryLoading = () => <p>Loading...</p>;
    const ArbitraryPage = () => <h1>Home</h1>;
    const typecheckInvalidConcerns = () => {
      // @ts-expect-error Layout concerns must be created with ERSC.Layout.make.
      ERSC.Routes.make({ layout: ArbitraryLayout });
      // @ts-expect-error Loading concerns must be created with ERSC.Loading.make.
      ERSC.Routes.make({ loading: ArbitraryLoading });
      // @ts-expect-error Page concerns must be created with ERSC.Page.make.
      ERSC.Routes.make().page('/', ArbitraryPage);
    };

    expect(typecheckInvalidConcerns).toBeTypeOf('function');
  });
});
