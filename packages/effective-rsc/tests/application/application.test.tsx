import { describe, expect, it } from '@effect/vitest';
import { Context, Effect, Layer } from 'effect';
import { isValidElement, Suspense, type ReactElement, type ReactNode } from 'react';

import { Application, type ApplicationServices } from '../../src/application/definition';
import { Layout, type LayoutProps } from '../../src/application/layout';
import { Loading } from '../../src/application/loading';
import { Page } from '../../src/application/page';
import type { RenderRuntime } from '../../src/application/render-runtime';
import { RouteOutlet, RouteTree, type RouteNode } from '../../src/application/route-tree';
import { Slot } from '../../src/application/slot';

const asElement = <Props,>(node: ReactNode): ReactElement<Props> => {
  if (!isValidElement<Props>(node)) {
    throw new Error('Expected a React element.');
  }

  return node;
};

const runtime: RenderRuntime<never> = (effect) => Effect.runPromise(effect);

const asRouteTree = (node: ReactNode): RouteNode => {
  const tree = asElement<{ readonly root: RouteNode }>(node);
  expect(tree.type).toBe(RouteTree);
  return tree.props.root;
};

const getRequiredSlot = (node: RouteNode, name: string): RouteNode => {
  const child = node.slots[name];
  if (child === null || child === undefined) {
    throw new Error(`Expected route node "${node.id}" to contain slot "${name}".`);
  }
  return child;
};

const RootLayout = Layout.make({
  slots: [],
  render: Effect.fnUntraced(function* ({ children }: LayoutProps) {
    return yield* Effect.succeed(<main>{children}</main>);
  }),
});
const RootLoading = Loading.make(() => <p>Loading...</p>);
const HomePage = Page.make(() => Effect.succeed(<h1>Home</h1>));
const AboutPage = Page.make(() => Effect.succeed(<h1>About</h1>));

class LayoutService extends Context.Service<LayoutService, object>()(
  'effective-rsc/tests/application/LayoutService',
) {}

class PageService extends Context.Service<PageService, object>()(
  'effective-rsc/tests/application/PageService',
) {}

class AboutPageService extends Context.Service<AboutPageService, object>()(
  'effective-rsc/tests/application/AboutPageService',
) {}

class SlotService extends Context.Service<SlotService, object>()(
  'effective-rsc/tests/application/SlotService',
) {}

class LayerDependency extends Context.Service<LayerDependency, object>()(
  'effective-rsc/tests/application/LayerDependency',
) {}

describe('Application.make', () => {
  it('composes the explicit root layout and page', () => {
    const App = Application.make({
      routes: {
        '/': {
          layout: RootLayout,
          page: HomePage,
          slots: {},
        },
      },
    });
    const rootNode = asRouteTree(App.component({ pathname: '/', runtime }));
    const root = asElement<{ readonly children: ReactNode }>(rootNode.element);
    const slot = asElement<{ readonly name: string }>(root.props.children);
    const pageNode = getRequiredSlot(rootNode, 'children');
    const page = asElement<{ readonly runtime: RenderRuntime<never> }>(pageNode.element);

    expect(rootNode.id).toBe('layout:root');
    expect(root.type).toBe(RootLayout);
    expect(slot.type).toBe(RouteOutlet);
    expect(slot.props.name).toBe('children');
    expect(pageNode.id).toBe('page:/');
    expect(page.type).toBe(HomePage);
    expect(page.props.runtime).toBe(runtime);
  });

  it('places the optional loading concern in a native Suspense boundary', () => {
    const App = Application.make({
      routes: {
        '/': {
          layout: RootLayout,
          loading: RootLoading,
          page: HomePage,
          slots: {},
        },
      },
    });
    const rootNode = asRouteTree(App.component({ pathname: '/', runtime }));
    const root = asElement<{ readonly children: ReactNode }>(rootNode.element);
    const slot = asElement<{ readonly name: string }>(root.props.children);
    const pageNode = getRequiredSlot(rootNode, 'children');
    const suspense = asElement<{
      readonly children: ReactNode;
      readonly fallback: ReactNode;
    }>(pageNode.element);
    const fallback = asElement(suspense.props.fallback);
    const page = asElement<{ readonly runtime: RenderRuntime<never> }>(suspense.props.children);

    expect(slot.type).toBe(RouteOutlet);
    expect(suspense.type).toBe(Suspense);
    expect(fallback.type).toBe(RootLoading);
    expect(page.type).toBe(HomePage);
    expect(page.props.runtime).toBe(runtime);
  });

  it('compiles declared parallel slots into independent named route nodes', () => {
    const ParallelLayout = Layout.make({
      slots: ['sidebar', 'modal'],
      render: Effect.fnUntraced(function* ({
        children,
        modal,
        sidebar,
      }: LayoutProps<'sidebar' | 'modal'>) {
        return yield* Effect.succeed(
          <main>
            {children}
            {sidebar}
            {modal}
          </main>,
        );
      }),
    });
    const SidebarLoading = Loading.make(() => <p>Loading sidebar...</p>);
    const Sidebar = Slot.make(() => Effect.succeed(<aside>Sidebar</aside>));
    const App = Application.make({
      routes: {
        '/': {
          layout: ParallelLayout,
          page: HomePage,
          slots: {
            modal: null,
            sidebar: {
              content: Sidebar,
              loading: SidebarLoading,
            },
          },
        },
      },
    });
    const rootNode = asRouteTree(App.component({ pathname: '/', runtime }));
    const root = asElement<{
      readonly children: ReactNode;
      readonly modal: ReactNode;
      readonly sidebar: ReactNode;
    }>(rootNode.element);
    const childrenOutlet = asElement<{ readonly name: string }>(root.props.children);
    const sidebarOutlet = asElement<{ readonly name: string }>(root.props.sidebar);
    const modalOutlet = asElement<{ readonly name: string }>(root.props.modal);
    const sidebarNode = getRequiredSlot(rootNode, 'sidebar');
    const suspense = asElement<{
      readonly children: ReactNode;
      readonly fallback: ReactNode;
    }>(sidebarNode.element);
    const sidebar = asElement<{ readonly runtime: RenderRuntime<never> }>(suspense.props.children);

    expect(childrenOutlet.type).toBe(RouteOutlet);
    expect(childrenOutlet.props.name).toBe('children');
    expect(sidebarOutlet.type).toBe(RouteOutlet);
    expect(sidebarOutlet.props.name).toBe('sidebar');
    expect(modalOutlet.type).toBe(RouteOutlet);
    expect(modalOutlet.props.name).toBe('modal');
    expect(sidebarNode.id).toBe('slot:sidebar:/');
    expect(suspense.type).toBe(Suspense);
    expect(asElement(suspense.props.fallback).type).toBe(SidebarLoading);
    expect(sidebar.type).toBe(Sidebar);
    expect(rootNode.slots['modal']).toBeNull();
  });

  it('requires every route to satisfy the root layout slot contract', () => {
    const ParallelLayout = Layout.make({
      slots: ['sidebar', 'modal'],
      render: () => Effect.succeed(<main />),
    });
    const Sidebar = Slot.make(() => Effect.succeed(<aside>Sidebar</aside>));

    expect(() =>
      Application.make({
        routes: {
          '/': {
            layout: ParallelLayout,
            page: HomePage,
            // @ts-expect-error The modal slot declared by the Layout is required on every route.
            slots: { sidebar: { content: Sidebar } },
          },
        },
      }),
    ).toThrowError('Static route "/" does not define slot "modal".');

    expect(() =>
      Application.make({
        routes: {
          '/': {
            layout: ParallelLayout,
            page: HomePage,
            slots: {
              modal: null,
              sidebar: { content: Sidebar },
              // @ts-expect-error Layouts reject slots that they did not declare.
              toolbar: { content: Sidebar },
            },
          },
        },
      }),
    ).toThrowError('Static route "/" defines undeclared layout slot "toolbar".');
  });

  it('renders a static child page inside the inherited root concerns', () => {
    const App = Application.make({
      routes: {
        '/': {
          layout: RootLayout,
          loading: RootLoading,
          page: HomePage,
          slots: {},
        },
        '/about': {
          page: AboutPage,
          slots: {},
        },
      },
    });
    const rootNode = asRouteTree(App.component({ pathname: '/about', runtime }));
    const root = asElement<{ readonly children: ReactNode }>(rootNode.element);
    const pageNode = getRequiredSlot(rootNode, 'children');
    const suspense = asElement<{
      readonly children: ReactNode;
      readonly fallback: ReactNode;
    }>(pageNode.element);
    const page = asElement<{ readonly runtime: RenderRuntime<never> }>(suspense.props.children);

    expect(App.paths).toEqual(['/', '/about']);
    expect(root.type).toBe(RootLayout);
    expect(pageNode.id).toBe('page:/about');
    expect(suspense.type).toBe(Suspense);
    expect(page.type).toBe(AboutPage);
    expect(page.props.runtime).toBe(runtime);
  });

  it('rejects dynamic route syntax during the static-route checkpoint', () => {
    expect(() =>
      Application.make({
        routes: {
          '/': {
            layout: RootLayout,
            page: HomePage,
            slots: {},
          },
          '/users/:userId': {
            page: AboutPage,
            slots: {},
          },
        },
      }),
    ).toThrowError('Invalid static route path "/users/:userId"');
  });

  it('rejects nested concerns during the root-inheritance checkpoint', () => {
    expect(() =>
      Application.make({
        routes: {
          '/': {
            layout: RootLayout,
            page: HomePage,
            slots: {},
          },
          '/about': {
            layout: RootLayout,
            page: AboutPage,
            slots: {},
          },
        },
      }),
    ).toThrowError(
      'Static route "/about" cannot define the "layout" concern. Only the root route can define layout and loading concerns.',
    );
  });

  it('reserves the framework asset namespace', () => {
    expect(() =>
      Application.make({
        routes: {
          '/': {
            layout: RootLayout,
            page: HomePage,
            slots: {},
          },
          '/_ersc/assets/example': {
            page: AboutPage,
            slots: {},
          },
        },
      }),
    ).toThrowError(
      'Static route "/_ersc/assets/example" uses the framework-reserved "/_ersc/assets" namespace.',
    );
  });

  it('combines layout, page, and slot service requirements', () => {
    const ServiceLayout = Layout.make({
      slots: ['sidebar'],
      render: Effect.fnUntraced(function* ({ children }: LayoutProps<'sidebar'>) {
        yield* LayoutService;
        return children;
      }),
    });
    const ServicePage = Page.make(
      Effect.fnUntraced(function* () {
        yield* PageService;
        return <h1>Services</h1>;
      }),
    );
    const ServiceSlot = Slot.make(
      Effect.fnUntraced(function* () {
        yield* SlotService;
        return <aside>Services</aside>;
      }),
    );
    const ApplicationLayer = Layer.mergeAll(
      Layer.succeed(LayoutService, LayoutService.of({})),
      Layer.succeed(PageService, PageService.of({})),
      Layer.succeed(SlotService, SlotService.of({})),
    );
    const App = Application.make({
      routes: {
        '/': {
          layout: ServiceLayout,
          page: ServicePage,
          slots: {
            sidebar: { content: ServiceSlot },
          },
        },
      },
      servicesLayer: ApplicationLayer,
    });
    type Services = ApplicationServices<typeof App>;
    const servicesAreCombined: [Services] extends [LayoutService | PageService | SlotService]
      ? [LayoutService | PageService | SlotService] extends [Services]
        ? true
        : false
      : false = true;

    expect(servicesAreCombined).toBe(true);
    expect(App.servicesLayer).toBe(ApplicationLayer);
  });

  it('combines service requirements from every static page', () => {
    const ServicePage = Page.make(
      Effect.fnUntraced(function* () {
        yield* PageService;
        return <h1>Home</h1>;
      }),
    );
    const ServiceAboutPage = Page.make(
      Effect.fnUntraced(function* () {
        yield* AboutPageService;
        return <h1>About</h1>;
      }),
    );
    const ApplicationLayer = Layer.mergeAll(
      Layer.succeed(PageService, PageService.of({})),
      Layer.succeed(AboutPageService, AboutPageService.of({})),
    );
    const App = Application.make({
      routes: {
        '/': {
          layout: RootLayout,
          page: ServicePage,
          slots: {},
        },
        '/about': {
          page: ServiceAboutPage,
          slots: {},
        },
      },
      servicesLayer: ApplicationLayer,
    });
    type Services = ApplicationServices<typeof App>;
    const servicesAreCombined: [Services] extends [PageService | AboutPageService]
      ? [PageService | AboutPageService] extends [Services]
        ? true
        : false
      : false = true;

    expect(servicesAreCombined).toBe(true);
    expect(App.servicesLayer).toBe(ApplicationLayer);
  });

  it('requires a closed application Layer for route services', () => {
    const ServicePage = Page.make(
      Effect.fnUntraced(function* () {
        yield* PageService;
        return <h1>Services</h1>;
      }),
    );
    const routes = {
      '/': {
        layout: RootLayout,
        page: ServicePage,
        slots: {},
      },
    };

    // @ts-expect-error Every inferred route service must be supplied by the application Layer.
    Application.make({ routes });

    const IncompleteApplicationLayer = Layer.effect(
      PageService,
      Effect.as(LayerDependency, PageService.of({})),
    );

    Application.make({
      routes,
      // @ts-expect-error The application Layer must have no remaining service requirements.
      servicesLayer: IncompleteApplicationLayer, // oxlint-disable-line effecttsgo/missing-layer-context -- intentional invalid Layer fixture
    });

    expect(true).toBe(true);
  });

  it('requires factory-created route concerns', () => {
    const ArbitraryLayout = ({ children }: { readonly children: ReactNode }) => (
      <main>{children}</main>
    );
    const ArbitraryLoading = () => <p>Loading...</p>;
    const ArbitraryPage = () => <h1>Home</h1>;

    const typecheckInvalidConcerns = () => {
      Application.make({
        routes: {
          '/': {
            // @ts-expect-error Layout concerns must be created with Layout.make.
            layout: ArbitraryLayout,
            page: HomePage,
            slots: {},
          },
        },
      });
      Application.make({
        routes: {
          '/': {
            layout: RootLayout,
            // @ts-expect-error Loading concerns must be created with Loading.make.
            loading: ArbitraryLoading,
            page: HomePage,
            slots: {},
          },
        },
      });
      Application.make({
        routes: {
          '/': {
            layout: RootLayout,
            // @ts-expect-error Page concerns must be created with Page.make.
            page: ArbitraryPage,
            slots: {},
          },
        },
      });
    };

    expect(typecheckInvalidConcerns).toBeTypeOf('function');
  });
});
