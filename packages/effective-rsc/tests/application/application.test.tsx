import { describe, expect, it } from '@effect/vitest';
import { Context, Effect, Layer, Option, Schema } from 'effect';
import { isValidElement, Suspense, type ReactElement, type ReactNode } from 'react';

import type { ApplicationServices } from '../../src/application/definition';
import { Application } from '../../src/application/ersc';
import { RouteOutlet, type RouteTreeModel } from '../../src/application/route-tree';

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
    const rootNode = App.renderRouteTree({ pathname: '/' });
    const root = asElement<{ readonly children: ReactNode }>(rootNode.content);
    const pageNode = requiredChild(rootNode);

    expect(rootNode.id).not.toBe(pageNode.id);
    expect(root.type).toBe(RootLayout);
    expect(asElement(root.props.children).type).toBe(RouteOutlet);
    expect(asElement(pageNode.content).type).toBe(HomePage);
    expect(App.paths).toEqual(['/']);
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
    const sundayRootNode = App.renderRouteTree({ pathname: '/schedule/day-two' });
    const saturdayRootNode = App.renderRouteTree({ pathname: '/schedule' });
    const scheduleLayoutNode = requiredChild(sundayRootNode);
    const saturdayScheduleLayoutNode = requiredChild(saturdayRootNode);
    const loadingNode = requiredChild(scheduleLayoutNode);
    const saturdayLoadingNode = requiredChild(saturdayScheduleLayoutNode);
    const pageNode = requiredChild(loadingNode);
    const loadingBoundary = asElement<{
      readonly children: ReactNode;
      readonly fallback: ReactNode;
    }>(loadingNode.content);

    expect(App.paths).toEqual(['/', '/schedule', '/schedule/day-two']);
    expect(asElement(sundayRootNode.content).type).toBe(RootLayout);
    expect(scheduleLayoutNode.id).toBe(saturdayScheduleLayoutNode.id);
    expect(asElement(scheduleLayoutNode.content).type).toBe(ScheduleLayout);
    expect(loadingNode.id).not.toBe(saturdayLoadingNode.id);
    expect(loadingBoundary.type).toBe(Suspense);
    expect(asElement(loadingBoundary.props.fallback).type).toBe(ScheduleLoading);
    expect(asElement(loadingBoundary.props.children).type).toBe(RouteOutlet);
    expect(pageNode.id).not.toBe(loadingNode.id);
    expect(asElement(pageNode.content).type).toBe(SundayPage);
  });

  it('lets layoutless Routes group paths without adding a rendered node', () => {
    const groupedRoutes = ERSC.Routes.make().page('/', SaturdayPage).page('/day-two', SundayPage);
    const App = ERSC.make({
      routes: ERSC.Routes.make({ layout: RootLayout }).mount('/schedule', groupedRoutes),
    });
    const rootNode = App.renderRouteTree({ pathname: '/schedule/day-two' });
    const pageNode = requiredChild(rootNode);

    expect(asElement(pageNode.content).type).toBe(SundayPage);
  });

  it('supports a Loading scope without requiring a nested Layout', () => {
    const groupedRoutes = ERSC.Routes.make({ loading: ScheduleLoading }).page('/', SaturdayPage);
    const App = ERSC.make({
      routes: ERSC.Routes.make({ layout: RootLayout }).mount('/schedule', groupedRoutes),
    });
    const rootNode = App.renderRouteTree({ pathname: '/schedule' });
    const loadingNode = requiredChild(rootNode);
    const pageNode = requiredChild(loadingNode);

    expect(asElement(loadingNode.content).type).toBe(Suspense);
    expect(asElement(pageNode.content).type).toBe(SaturdayPage);
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
      App.renderRouteTree({ pathname: '/saturday/day-two' }),
    );
    const sundayLayoutNode = requiredChild(App.renderRouteTree({ pathname: '/sunday/day-two' }));

    expect(App.paths).toEqual([
      '/',
      '/saturday',
      '/saturday/day-two',
      '/sunday',
      '/sunday/day-two',
    ]);
    expect(saturdayLayoutNode.id).not.toBe(sundayLayoutNode.id);
    expect(requiredChild(saturdayLayoutNode).id).not.toBe(requiredChild(sundayLayoutNode).id);
  });

  it('rejects rendering a pathname that is not a compiled destination', () => {
    const App = ERSC.make({
      routes: ERSC.Routes.make({ layout: RootLayout })
        .page('/', HomePage)
        .mount('/schedule', ERSC.Routes.make().page('/', SaturdayPage)),
    });

    expect(App.paths).toEqual(['/', '/schedule']);
    expect(() => App.renderRouteTree({ pathname: '/schedule/day-two' })).toThrow(
      'No static route is registered for "/schedule/day-two".',
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
      servicesLayer: ApplicationLayer,
    });
    type Services = ApplicationServices<typeof App>;
    const servicesAreCombined: [Services] extends [LayoutService | PageService | NestedPageService]
      ? [LayoutService | PageService | NestedPageService] extends [Services]
        ? true
        : false
      : false = true;

    expect(servicesAreCombined).toBe(true);
    expect(App.servicesLayer).toBe(ApplicationLayer);
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
        servicesLayer: IncompleteApplicationLayer, // oxlint-disable-line effecttsgo/missing-layer-context -- intentional invalid Layer fixture
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
    const OtherRoutes = OtherERSC.Routes.make({ layout: OtherLayout }).page('/', OtherPage);

    expect(() => ERSC.Routes.make({ loading: OtherLoading })).toThrow(
      'Loading was created by a different ERSC module.',
    );
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
