import { expect, type Page } from '@playwright/test';

type ViewTransitionObservation = {
  status: 'Finished' | 'Rejected' | 'Started';
  readonly types: ReadonlyArray<string>;
};

export const observeViewTransitions = (page: Page) =>
  page.addInitScript(() => {
    const startViewTransition = document.startViewTransition.bind(document);
    Reflect.set(window, '__ersc_view_transitions__', []);
    Reflect.set(document, 'startViewTransition', (...args: ReadonlyArray<unknown>) => {
      const transition = Reflect.apply(startViewTransition, document, args) as ViewTransition;
      const transitions = Reflect.get(
        window,
        '__ersc_view_transitions__',
      ) as Array<ViewTransitionObservation>;
      const options = args[0];
      const types =
        typeof options === 'object' &&
        options !== null &&
        Array.isArray(Reflect.get(options, 'types'))
          ? (Reflect.get(options, 'types') as ReadonlyArray<string>)
          : [];
      const observation: ViewTransitionObservation = { status: 'Started', types };
      transitions.push(observation);
      void transition.finished.then(
        () => {
          observation.status = 'Finished';
        },
        () => {
          observation.status = 'Rejected';
        },
      );
      return transition;
    });
  });

export const waitForViewTransition = (page: Page, types: ReadonlyArray<string>) =>
  expect
    .poll(
      () => page.evaluate(() => JSON.stringify(Reflect.get(window, '__ersc_view_transitions__'))),
      { timeout: 3_000 },
    )
    .toContain(JSON.stringify({ status: 'Finished', types }));
