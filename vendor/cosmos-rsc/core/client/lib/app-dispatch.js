import { startTransition, useEffect } from 'react';

let appDispatch = null;

export function dispatchAppAction(action) {
  if (appDispatch === null)
    throw new Error('App action dispatched before initialization');

  startTransition(() => {
    appDispatch(action);
  });
}

export function useAppDispatch(dispatch) {
  useEffect(() => {
    appDispatch = dispatch;
  }, [dispatch]);
}
