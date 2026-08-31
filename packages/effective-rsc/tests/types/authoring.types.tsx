import { Context, Effect, Layer, Option, Schema, SchemaTransformation } from 'effect';
import type { ReactNode } from 'react';

import type { ApplicationServices } from '../../src/application/definition';
import { Application } from '../../src/application/ersc';
import type { AnyPageDefinition } from '../../src/application/page';
import type { AbsolutePath } from '../../src/application/route-path';
import type { AnyRoutes, RoutesPaths } from '../../src/application/routes';

class LayoutService extends Context.Service<LayoutService, object>()(
  'ersc/tests/types/LayoutService',
) {}
class PageService extends Context.Service<PageService, object>()('ersc/tests/types/PageService') {}
class NestedPageService extends Context.Service<NestedPageService, object>()(
  'ersc/tests/types/NestedPageService',
) {}
class LayerDependency extends Context.Service<LayerDependency, object>()(
  'ersc/tests/types/LayerDependency',
) {}

const ERSC = Application.ersc();
const RootLayout = ERSC.Layout.make({ render: ({ children }) => Effect.succeed(children) });
ERSC.Layout.make({
  render: ({ children }) => {
    const inferredChildren: ReactNode = children;
    const childrenAreNotAny: 0 extends 1 & typeof children ? false : true = true;
    void childrenAreNotAny;
    return Effect.succeed(inferredChildren);
  },
});
const Loading = ERSC.Loading.make({ render: () => <p>Loading...</p> });
void Loading;
const HomePage = ERSC.Page.make({ render: () => Effect.succeed(<h1>Home</h1>) });
const HistoryPage = ERSC.Page.make({ render: () => Effect.succeed(<h1>History</h1>) });
const DayPage = ERSC.Page.make({
  params: Schema.Struct({ day: Schema.Literals(['saturday', 'sunday']) }),
  render: ({ params }) => Effect.succeed(<h1>{params.day}</h1>),
});
const SlugPage = ERSC.Page.make({
  params: Schema.Struct({ slug: Schema.String }),
  render: ({ params }) => Effect.succeed(<h1>{params.slug}</h1>),
});
const NestedParamsPage = ERSC.Page.make({
  params: Schema.Struct({ b: Schema.String, d: Schema.String }),
  render: ({ params }) => Effect.succeed(`${params.b}/${params.d}`),
});
const RenamedParamsPage = ERSC.Page.make({
  params: Schema.Struct({ slug: Schema.String }).pipe(
    Schema.decodeTo(
      Schema.Struct({ id: Schema.String }),
      SchemaTransformation.transform({
        decode: ({ slug }) => ({ id: slug }),
        encode: ({ id }) => ({ slug: id }),
      }),
    ),
  ),
  render: ({ params }) => Effect.succeed(params.id),
});

const middleware = ERSC.Middleware.make((httpEffect) => httpEffect);
ERSC.withMiddleware(middleware).Routes.make();
ERSC.Middleware.make(
  // @ts-expect-error Middleware must handle every typed failure it introduces.
  // oxlint-disable-next-line effecttsgo/missing-effect-context, effecttsgo/missing-effect-error -- intentional invalid Effect fixture
  (httpEffect) => Effect.andThen(Effect.fail('failure'), httpEffect),
);

const notesRoutes = ERSC.Routes.make().page('/', HomePage).page('/history', HistoryPage);
const mountedRoutes = ERSC.Routes.make().mount('/notes', notesRoutes);
const knownNotesPath: RoutesPaths<typeof mountedRoutes> = '/notes/history';
void knownNotesPath;
// @ts-expect-error Runtime paths are private to the route compiler.
void mountedRoutes.paths;
// @ts-expect-error Runtime pages are private to the route compiler.
void mountedRoutes.pages;
// @ts-expect-error Runtime mounts are private to the route compiler.
void mountedRoutes.mounts;

const dynamicRoutes = ERSC.Routes.make().page('/schedule/:day', DayPage);
const knownDynamicPath: RoutesPaths<typeof dynamicRoutes> = '/schedule/:day';
void knownDynamicPath;
// @ts-expect-error A static Page cannot satisfy a dynamic route.
ERSC.Routes.make().page('/schedule/:day', HomePage);
// @ts-expect-error A dynamic Page cannot satisfy a static route.
ERSC.Routes.make().page('/schedule/saturday', DayPage);
// @ts-expect-error The Page Schema key must match the path parameter name.
ERSC.Routes.make().page('/schedule/:day', SlugPage);
// @ts-expect-error Page implementation details are not part of the authoring API.
void DayPage.component;

const nestedRoutes = ERSC.Routes.make().page('/a/:b/c/:d', NestedParamsPage);
const knownNestedPath: RoutesPaths<typeof nestedRoutes> = '/a/:b/c/:d';
void knownNestedPath;
// @ts-expect-error The Page Schema must contain both nested parameter names.
ERSC.Routes.make().page('/a/:b/c/:d', DayPage);
// @ts-expect-error Parameter names must remain unique across the complete pattern.
ERSC.Routes.make().page('/a/:b/c/:b', NestedParamsPage);
// @ts-expect-error Route parameters describe the Schema input, not its decoded output.
ERSC.Routes.make().page('/:id', RenamedParamsPage);

declare const uncertainPath: '/first' | '/second';
const widenedPath: AbsolutePath = '/schedule/:day';
const forgetPageContract = (page: AnyPageDefinition<never>) => page;
const widenedPage = forgetPageContract(HomePage);
const widenedRoutes: AnyRoutes<never> = ERSC.Routes.make().page('/', HomePage);
// @ts-expect-error A widened path cannot provide exact parameter inference.
ERSC.Routes.make().page(widenedPath, HomePage);
// @ts-expect-error One route declaration must have one literal pattern.
ERSC.Routes.make().page(uncertainPath, HomePage);
// @ts-expect-error A widened Page no longer proves whether it owns parameters.
ERSC.Routes.make().page('/', widenedPage);
// @ts-expect-error Widened Routes no longer carry their exact mounted paths.
ERSC.Routes.make().mount('/nested', widenedRoutes);

// @ts-expect-error An empty parameter Schema cannot match a parameterized path.
ERSC.Page.make({ params: Schema.Struct({}), render: () => Effect.succeed(null) });
const recordParamsPageOptions = {
  params: Schema.Record(Schema.String, Schema.String),
  render: () => Effect.succeed(null),
};
// @ts-expect-error A record Schema has no finite parameter-name set.
ERSC.Page.make(recordParamsPageOptions);
const nonStringParamsPageOptions = {
  params: Schema.Struct({ count: Schema.Finite }),
  render: () => Effect.succeed(null),
};
// @ts-expect-error Effect HTTP captures path parameters as strings.
ERSC.Page.make(nonStringParamsPageOptions);
const invalidNameParamsPageOptions = {
  params: Schema.Struct({ 'invalid-name': Schema.String }),
  render: () => Effect.succeed(null),
};
// @ts-expect-error Schema keys must be valid Effect HTTP parameter names.
ERSC.Page.make(invalidNameParamsPageOptions);

// @ts-expect-error Dynamic params must occupy a complete path segment.
ERSC.Routes.make().page('/users/user:userId', HomePage);
// @ts-expect-error Dynamic parameter names must be unique.
ERSC.Routes.make().page('/users/:userId/:userId', HomePage);
// @ts-expect-error Route definitions must use canonical non-trailing slashes.
ERSC.Routes.make().page('/users/', HomePage);
// @ts-expect-error Route definitions cannot contain empty segments.
ERSC.Routes.make().page('/users//history', HomePage);
// @ts-expect-error Route definitions cannot contain URL-normalized dot segments.
ERSC.Routes.make().page('/users/../history', HomePage);
// @ts-expect-error Route definitions use decoded path text, not percent escapes.
ERSC.Routes.make().page('/users/%61', HomePage);
// @ts-expect-error Dynamic mount prefixes are not supported.
ERSC.Routes.make().mount('/:group', ERSC.Routes.make().page('/', HomePage));
ERSC.make({
  // @ts-expect-error The final application path uses the framework asset namespace.
  routes: ERSC.Routes.make({ layout: RootLayout }).page('/_ersc/assets/example', HomePage),
});
ERSC.make({
  // @ts-expect-error A parameterized pattern can match the framework asset namespace.
  routes: ERSC.Routes.make({ layout: RootLayout }).page('/:slug/assets', SlugPage),
});

const homeRoutes = ERSC.Routes.make().page('/', HomePage);
// @ts-expect-error A local Page cannot replace an existing Page.
homeRoutes.page('/', HistoryPage);
// @ts-expect-error Mounted paths cannot collide with existing paths.
homeRoutes.mount('/', ERSC.Routes.make().page('/', HistoryPage));
const emptyRoutes = ERSC.Routes.make({ layout: RootLayout });
// @ts-expect-error Empty Routes do not contribute an application destination.
ERSC.Routes.make().mount('/empty', emptyRoutes);

const App = ERSC.make({ routes: ERSC.Routes.make({ layout: RootLayout }).page('/', HomePage) });
// @ts-expect-error Compiled routes are private to framework runtime modules.
void App.routes;
// @ts-expect-error The application Layer is private to framework runtime modules.
void App.layer;
// @ts-expect-error The React adapter is private to framework runtime modules.
void DayPage.component;
// @ts-expect-error The parameter Schema is private to framework runtime modules.
void DayPage.paramsSchema;

const CreateReport = ERSC.ServerFn.make({
  input: Schema.fromFormData(Schema.Struct({ title: Schema.NonEmptyString })),
  handler: ({ title }) => {
    const inferredTitle: string = title;
    void inferredTitle;
    return Effect.void;
  },
});
const directFormInvocation: Promise<void> = CreateReport(new FormData());
void directFormInvocation;
function DirectServerFnForm() {
  return <form action={CreateReport} />;
}
void DirectServerFnForm;
// @ts-expect-error A Server Function accepts the Schema's encoded input, not its decoded output.
void CreateReport({ title: 'Incident report' });

const ServiceERSC = Application.ersc<PageService>();
const ServiceRootLayout = ServiceERSC.Layout.make({
  render: ({ children }) => Effect.succeed(children),
});
const ServicePage = ServiceERSC.Page.make({
  render: Effect.fnUntraced(function* () {
    yield* PageService;
    return null;
  }),
});
const serviceRoutes = ServiceERSC.Routes.make({ layout: ServiceRootLayout }).page('/', ServicePage);
const incompleteLayer = Layer.effect(PageService, Effect.as(LayerDependency, PageService.of({})));
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
  layer: incompleteLayer, // oxlint-disable-line effecttsgo/missing-layer-context -- intentional invalid Layer fixture
});

const NarrowERSC = Application.ersc<PageService>();
const ServiceSchema = Schema.String.pipe(
  Schema.catchDecodingWithContext(() => Effect.map(LayoutService, () => Option.some('fallback'))),
);
const layoutServicePageOptions = {
  render: Effect.fnUntraced(function* () {
    yield* LayoutService;
    return null;
  }),
};
// @ts-expect-error LayoutService is not part of this application's declared contracts.
NarrowERSC.Page.make(layoutServicePageOptions); // oxlint-disable-line effecttsgo/missing-effect-context -- intentional invalid Effect fixture
const ProvideLayoutService = NarrowERSC.Middleware.make<{ provides: LayoutService }>((httpEffect) =>
  httpEffect.pipe(Effect.provideService(LayoutService, LayoutService.of({}))),
);
const LayoutServiceERSC = NarrowERSC.withMiddleware(ProvideLayoutService);
LayoutServiceERSC.Page.make(layoutServicePageOptions);
const ProvideLayoutDependencies = NarrowERSC.Middleware.make<{
  provides: LayoutService | LayerDependency;
}>((httpEffect) =>
  httpEffect.pipe(
    Effect.provideService(LayoutService, LayoutService.of({})),
    Effect.provideService(LayerDependency, LayerDependency.of({})),
  ),
);
const LayoutDependenciesERSC = NarrowERSC.withMiddleware(ProvideLayoutDependencies);
LayoutDependenciesERSC.Page.make({
  render: Effect.fnUntraced(function* () {
    yield* LayoutService;
    yield* LayerDependency;
    return null;
  }),
});
NarrowERSC.Middleware.make<{ provides: LayoutService }>(
  // @ts-expect-error A middleware must provide every service declared in `provides`.
  // oxlint-disable-next-line effecttsgo/missing-effect-context, effecttsgo/missing-effect-error -- intentional invalid middleware fixture
  (httpEffect) => httpEffect,
);
const RequiresLayoutService = LayoutServiceERSC.Middleware.make((httpEffect) =>
  Effect.andThen(LayoutService, httpEffect),
);
LayoutServiceERSC.withMiddleware(RequiresLayoutService);
// @ts-expect-error Middleware requirements must already be available in the current scope.
NarrowERSC.withMiddleware(RequiresLayoutService);
NarrowERSC.Middleware.make((httpEffect) =>
  // @ts-expect-error LayoutService is not available to this middleware.
  // oxlint-disable-next-line effecttsgo/missing-effect-context, effecttsgo/missing-effect-error -- intentional invalid Effect fixture
  Effect.gen(function* () {
    yield* LayoutService;
    return yield* httpEffect;
  }),
);
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
  // @ts-expect-error LayoutService required by Schema decoding is outside this ERSC universe.
  input: ServiceSchema,
  handler: () => Effect.void,
});
const serviceSchemaPageOptions = {
  params: Schema.Struct({ value: ServiceSchema }),
  render: () => Effect.succeed(null),
};
// @ts-expect-error LayoutService required by param decoding is outside this ERSC universe.
NarrowERSC.Page.make(serviceSchemaPageOptions);

const WideERSC = Application.ersc<PageService | LayoutService>();
const NarrowPage = NarrowERSC.Page.make({ render: () => Effect.succeed(null) });
// @ts-expect-error An ERSC member belongs to one exact service universe.
WideERSC.Routes.make().page('/', NarrowPage);

function ArbitraryLayout({ children }: { readonly children: ReactNode }) {
  return <main>{children}</main>;
}
function ArbitraryLoading() {
  return <p>Loading...</p>;
}
function ArbitraryPage() {
  return <h1>Home</h1>;
}
// @ts-expect-error Layout concerns must be created with ERSC.Layout.make.
ERSC.Routes.make({ layout: ArbitraryLayout });
// @ts-expect-error Loading concerns must be created with ERSC.Loading.make.
ERSC.Routes.make({ loading: ArbitraryLoading });
// @ts-expect-error Page concerns must be created with ERSC.Page.make.
ERSC.Routes.make().page('/', ArbitraryPage);

const ServiceUniverseERSC = Application.ersc<LayoutService | PageService | NestedPageService>();
const ServiceUniverseLayout = ServiceUniverseERSC.Layout.make({
  render: ({ children }) => Effect.succeed(children),
});
const ServiceUniversePage = ServiceUniverseERSC.Page.make({ render: () => Effect.succeed(null) });
const ServiceUniverseApp = ServiceUniverseERSC.make({
  layer: Layer.mergeAll(
    Layer.succeed(LayoutService, LayoutService.of({})),
    Layer.succeed(PageService, PageService.of({})),
    Layer.succeed(NestedPageService, NestedPageService.of({})),
  ),
  routes: ServiceUniverseERSC.Routes.make({ layout: ServiceUniverseLayout }).page(
    '/',
    ServiceUniversePage,
  ),
});
type Services = ApplicationServices<typeof ServiceUniverseApp>;
const servicesAreExact: [Services] extends [LayoutService | PageService | NestedPageService]
  ? [LayoutService | PageService | NestedPageService] extends [Services]
    ? true
    : false
  : false = true;
void servicesAreExact;

const typecheckLoadingRenderers = (loading: boolean) => {
  ERSC.Loading.make({
    // @ts-expect-error Loading must be immediately renderable, not asynchronous.
    // oxlint-disable-next-line effecttsgo/async-function -- intentional invalid renderer fixture
    render: async () => <p>Loading...</p>,
  });
  ERSC.Loading.make({
    // @ts-expect-error Loading is service-free and does not execute an Effect operation.
    render: () => Effect.succeed(<p>Loading...</p>),
  });
  ERSC.Loading.make({
    // @ts-expect-error Loading cannot hide an Effect behind a union return type.
    render: () => (loading ? <p>Loading...</p> : Effect.succeed(<p>Loading...</p>)),
  });
};
void typecheckLoadingRenderers;
