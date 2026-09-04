import { dispatchAppAction } from './app-dispatch';
import { APP_ACTION } from './app-action';

export function callServer(id, args) {
  const { promise, resolve, reject } = Promise.withResolvers();

  dispatchAppAction({
    type: APP_ACTION.SERVER_ACTION,
    payload: { id, args },
    resolve,
    reject,
  });

  return promise;
}
