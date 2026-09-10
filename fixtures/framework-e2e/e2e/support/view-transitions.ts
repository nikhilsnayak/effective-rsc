// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based browser-test boundary.
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

export const expectViewTransition = async (
  page: Page,
  types: ReadonlyArray<string>,
  action: () => Promise<unknown>,
) => {
  const start = await page.evaluate(
    () =>
      (Reflect.get(window, '__ersc_view_transitions__') as Array<ViewTransitionObservation>).length,
  );
  await action();
  await expect
    .poll(
      () =>
        page.evaluate(
          (start) =>
            (
              Reflect.get(window, '__ersc_view_transitions__') as Array<ViewTransitionObservation>
            ).slice(start),
          start,
        ),
      { timeout: 3_000 },
    )
    .toContainEqual({ status: 'Finished', types });
};
