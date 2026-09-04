import { APP_ACTION } from './app-action.js';
import { getRSCPayload } from './get-rsc-payload.js';
import { postServerAction } from './post-server-action.js';
import { routerCache } from './router-cache.js';
import { getFullPath } from './utils.js';

export async function appReducer(prevState, action) {
  switch (action.type) {
    case APP_ACTION.NAVIGATE: {
      const { path, navigationType, commitPendingNavigation } = action.payload;

      if (navigationType === 'traverse' && routerCache.has(path)) {
        return {
          ...prevState,
          tree: routerCache.get(path),
          commitPendingNavigation,
        };
      }

      const tree = await getRSCPayload(path);
      routerCache.set(path, tree);

      return {
        ...prevState,
        tree,
        commitPendingNavigation,
      };
    }

    case APP_ACTION.SERVER_ACTION: {
      const { id, args } = action.payload;
      const { resolve, reject } = action;

      const path = getFullPath(window.location.href);
      try {
        const { tree, serverActionResult } = await postServerAction(id, args);

        resolve(serverActionResult);
        routerCache.set(path, tree);

        return {
          ...prevState,
          tree,
        };
      } catch (error) {
        reject(error);
        return prevState;
      }
    }

    default:
      return prevState;
  }
}
