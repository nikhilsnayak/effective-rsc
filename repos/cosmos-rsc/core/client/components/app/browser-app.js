import {
  startTransition,
  useLayoutEffect,
  addTransitionType,
  useActionState,
  useEffect,
} from 'react';
import { RouterContext } from '../router-context.js';
import { SlotContext } from '../slot-context.js';
import { appReducer } from '../../lib/app-reducer.js';
import { useAppDispatch } from '../../lib/app-dispatch.js';
import { APP_ACTION } from '../../lib/app-action.js';
import { getFullPath, shouldNotInterceptNavigation } from '../../lib/utils.js';

const navigationAPIAvailable =
  typeof window !== 'undefined' && typeof window.navigation === 'object';

export function BrowserApp({ initialState, rootLayout }) {
  const [appState, dispatch] = useActionState(appReducer, initialState);

  useAppDispatch(dispatch);

  useEffect(() => {
    if (!navigationAPIAvailable) {
      console.error('Navigation API is not available');
      return;
    }

    const controller = new AbortController();

    window.navigation.addEventListener(
      'navigate',
      (navigateEvent) => {
        if (shouldNotInterceptNavigation(navigateEvent)) {
          return;
        }

        const navigationType = navigateEvent.navigationType;
        const previousIndex = window.navigation.currentEntry.index;
        const { url, index: nextIndex } = navigateEvent.destination;
        const path = getFullPath(url);

        navigateEvent.intercept({
          precommitHandler() {
            const { promise, resolve: commitPendingNavigation } =
              Promise.withResolvers();
            startTransition(() => {
              if (navigationType === 'traverse') {
                if (nextIndex > previousIndex) {
                  addTransitionType('navigation-forward');
                } else if (nextIndex < previousIndex) {
                  addTransitionType('navigation-back');
                }
              } else {
                addTransitionType(`navigation-${navigationType}`);
              }
              dispatch({
                type: APP_ACTION.NAVIGATE,
                payload: {
                  path,
                  navigationType,
                  commitPendingNavigation,
                },
              });
            });
            return promise;
          },
        });
      },
      { signal: controller.signal }
    );

    return () => {
      controller.abort();
    };
  }, [dispatch]);

  useLayoutEffect(() => {
    appState.commitPendingNavigation();
  }, [appState]);

  const router = {
    push: (url) => {
      if (!navigationAPIAvailable) {
        console.error('Navigation API is not available');
        return;
      }
      window.navigation.navigate(url, { history: 'push' });
    },
  };

  return (
    <RouterContext value={router}>
      <SlotContext value={appState.tree}>{rootLayout}</SlotContext>
    </RouterContext>
  );
}
