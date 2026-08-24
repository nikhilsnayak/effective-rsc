import { describe, expect, it } from '@effect/vitest';
import { Context, Effect, Layer } from 'effect';
import { isValidElement, Suspense, type ReactElement, type ReactNode } from 'react';

import { Application, type ApplicationServices } from '../../src/application/definition';
import { Layout, type LayoutProps } from '../../src/application/layout';
import { Loading } from '../../src/application/loading';
import { Page } from '../../src/application/page';
import type { RenderRuntime } from '../../src/application/render-runtime';
import { RouteOutlet, type RouteTreeModel } from '../../src/application/route-tree';
import { Routes } from '../../src/application/routes';

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

const runtime: RenderRuntime<never> = (effect) => Effect.runPromise(effect);

const RootLayout = Layout.make({
  render: ({ children }: LayoutProps) =>
    Effect.succeed(
      <html lang='en'>
        <body>{children}</body>
      </html>,
    ),
});
const ScheduleLayout = Layout.make({
  render: ({ children }: LayoutProps) =>
    Effect.succeed(
      <section>
        <aside>Schedule navigation</aside>
        {children}
      </section>,
    ),
});
const ScheduleLoading = Loading.make(() => <p>Loading schedule...</p>);
const HomePage = Page.make(() => Effect.succeed(<h1>Home</h1>));
const SaturdayPage = Page.make(() => Effect.succeed(<h1>Saturday</h1>));
const SundayPage = Page.make(() => Effect.succeed(<h1>Sunday</h1>));

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

describe('Application.make', () => {
  it('renders a root Layout around its exact Page', () => {
    const App = Application.make({
      routes: Routes.make({ layout: RootLayout }).page('/', HomePage),
    });
    const rootNode = App.renderRouteTree({ pathname: '/', runtime });
    const root = asElement<{ readonly children: ReactNode }>(rootNode.content);
    const pageNode = requiredChild(rootNode);

    expect(rootNode.id).toBe('/');
    expect(root.type).toBe(RootLayout);
    expect(asElement(root.props.children).type).toBe(RouteOutlet);
    expect(pageNode.id).toBe('/');
    expect(asElement(pageNode.content).type).toBe(HomePage);
    expect(App.paths).toEqual(['/']);
  });

  it('preserves Layout ancestry and places Loading below its owning Layout', () => {
    const scheduleRoutes = Routes.make({
      layout: ScheduleLayout,
      loading: ScheduleLoading,
    })
      .page('/', SaturdayPage)
      .page('/day-two', SundayPage);
    const App = Application.make({
      routes: Routes.make({ layout: RootLayout })
        .page('/', HomePage)
        .mount('/schedule', scheduleRoutes),
    });
    const sundayRootNode = App.renderRouteTree({ pathname: '/schedule/day-two', runtime });
    const saturdayRootNode = App.renderRouteTree({ pathname: '/schedule', runtime });
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
    expect(scheduleLayoutNode.id).toBe('/schedule');
    expect(saturdayScheduleLayoutNode.id).toBe('/schedule');
    expect(asElement(scheduleLayoutNode.content).type).toBe(ScheduleLayout);
    expect(loadingNode.id).toBe('/schedule/day-two');
    expect(saturdayLoadingNode.id).toBe('/schedule');
    expect(loadingBoundary.type).toBe(Suspense);
    expect(asElement(loadingBoundary.props.fallback).type).toBe(ScheduleLoading);
    expect(asElement(loadingBoundary.props.children).type).toBe(RouteOutlet);
    expect(pageNode.id).toBe('/schedule/day-two');
    expect(asElement(pageNode.content).type).toBe(SundayPage);
  });

  it('lets layoutless Routes group paths without adding a rendered node', () => {
    const groupedRoutes = Routes.make().page('/', SaturdayPage).page('/day-two', SundayPage);
    const App = Application.make({
      routes: Routes.make({ layout: RootLayout }).mount('/schedule', groupedRoutes),
    });
    const rootNode = App.renderRouteTree({ pathname: '/schedule/day-two', runtime });
    const pageNode = requiredChild(rootNode);

    expect(pageNode.id).toBe('/schedule/day-two');
    expect(asElement(pageNode.content).type).toBe(SundayPage);
  });

  it('supports a Loading scope without requiring a nested Layout', () => {
    const groupedRoutes = Routes.make({ loading: ScheduleLoading }).page('/', SaturdayPage);
    const App = Application.make({
      routes: Routes.make({ layout: RootLayout }).mount('/schedule', groupedRoutes),
    });
    const rootNode = App.renderRouteTree({ pathname: '/schedule', runtime });
    const loadingNode = requiredChild(rootNode);
    const pageNode = requiredChild(loadingNode);

    expect(asElement(loadingNode.content).type).toBe(Suspense);
    expect(asElement(pageNode.content).type).toBe(SaturdayPage);
  });

  it('compiles one Routes value mounted at more than one prefix', () => {
    const sharedRoutes = Routes.make({ layout: ScheduleLayout })
      .page('/', SaturdayPage)
      .page('/day-two', SundayPage);
    const App = Application.make({
      routes: Routes.make({ layout: RootLayout })
        .page('/', HomePage)
        .mount('/saturday', sharedRoutes)
        .mount('/sunday', sharedRoutes),
    });
    const saturdayLayoutNode = requiredChild(
      App.renderRouteTree({ pathname: '/saturday/day-two', runtime }),
    );
    const sundayLayoutNode = requiredChild(
      App.renderRouteTree({ pathname: '/sunday/day-two', runtime }),
    );

    expect(App.paths).toEqual([
      '/',
      '/saturday',
      '/saturday/day-two',
      '/sunday',
      '/sunday/day-two',
    ]);
    expect(saturdayLayoutNode.id).toBe('/saturday');
    expect(sundayLayoutNode.id).toBe('/sunday');
    expect(requiredChild(saturdayLayoutNode).id).toBe('/saturday/day-two');
    expect(requiredChild(sundayLayoutNode).id).toBe('/sunday/day-two');
  });

  it('rejects rendering a pathname that is not a compiled destination', () => {
    const App = Application.make({
      routes: Routes.make({ layout: RootLayout })
        .page('/', HomePage)
        .mount('/schedule', Routes.make().page('/', SaturdayPage)),
    });

    expect(App.paths).toEqual(['/', '/schedule']);
    expect(() => App.renderRouteTree({ pathname: '/schedule/day-two', runtime })).toThrowError(
      'No static route is registered for "/schedule/day-two".',
    );
  });

  it('infers services through nested Layouts and Pages', () => {
    const ServiceLayout = Layout.make({
      render: Effect.fnUntraced(function* ({ children }: LayoutProps) {
        yield* LayoutService;
        return <>{children}</>;
      }),
    });
    const ServicePage = Page.make(
      Effect.fnUntraced(function* () {
        yield* PageService;
        return <h1>Home</h1>;
      }),
    );
    const ServiceNestedPage = Page.make(
      Effect.fnUntraced(function* () {
        yield* NestedPageService;
        return <h1>Nested</h1>;
      }),
    );
    const ApplicationLayer = Layer.mergeAll(
      Layer.succeed(LayoutService, LayoutService.of({})),
      Layer.succeed(PageService, PageService.of({})),
      Layer.succeed(NestedPageService, NestedPageService.of({})),
    );
    const App = Application.make({
      routes: Routes.make({ layout: ServiceLayout })
        .page('/', ServicePage)
        .mount('/nested', Routes.make().page('/', ServiceNestedPage)),
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

  it('requires a root Layout, a reachable Page, and a closed services Layer', () => {
    const ServicePage = Page.make(
      Effect.fnUntraced(function* () {
        yield* PageService;
        return <h1>Services</h1>;
      }),
    );
    const serviceRoutes = Routes.make({ layout: RootLayout }).page('/', ServicePage);
    const IncompleteApplicationLayer = Layer.effect(
      PageService,
      Effect.as(LayerDependency, PageService.of({})),
    );
    const typecheckInvalidApplications = () => {
      Application.make({
        // @ts-expect-error The application root must define a Layout.
        routes: Routes.make().page('/', HomePage),
      });
      Application.make({
        // @ts-expect-error The application must contain at least one reachable Page.
        routes: Routes.make({ layout: RootLayout }),
      });
      // @ts-expect-error Every inferred route service must be supplied by the application Layer.
      Application.make({ routes: serviceRoutes });
      Application.make({
        routes: serviceRoutes,
        // @ts-expect-error The application Layer must have no remaining service requirements.
        servicesLayer: IncompleteApplicationLayer, // oxlint-disable-line effecttsgo/missing-layer-context -- intentional invalid Layer fixture
      });
    };

    expect(typecheckInvalidApplications).toBeTypeOf('function');
    expect(() =>
      Application.make({ routes: Routes.make().page('/', HomePage) as never }),
    ).toThrowError('must define a Layout');
    expect(() =>
      Application.make({ routes: Routes.make({ layout: RootLayout }) as never }),
    ).toThrowError('must contain a Page');
  });

  it('requires factory-created concerns', () => {
    const ArbitraryLayout = ({ children }: LayoutProps) => <main>{children}</main>;
    const ArbitraryLoading = () => <p>Loading...</p>;
    const ArbitraryPage = () => <h1>Home</h1>;
    const typecheckInvalidConcerns = () => {
      // @ts-expect-error Layout concerns must be created with Layout.make.
      Routes.make({ layout: ArbitraryLayout });
      // @ts-expect-error Loading concerns must be created with Loading.make.
      Routes.make({ loading: ArbitraryLoading });
      // @ts-expect-error Page concerns must be created with Page.make.
      Routes.make().page('/', ArbitraryPage);
    };

    expect(typecheckInvalidConcerns).toBeTypeOf('function');
  });
});
