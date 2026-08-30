const ReactTransitionNavigationInfo = 'react-transition';

export const HistoryRollbackNavigationInfo = 'ersc-history-rollback';
export const NativeDocumentNavigationInfo = 'ersc-native-document';

export const isHistoryRollback = (event: NavigateEvent) =>
  event.info === HistoryRollbackNavigationInfo;

export const isRoutedNavigation = (event: NavigateEvent) =>
  !isHistoryRollback(event) &&
  event.canIntercept &&
  !event.hashChange &&
  event.downloadRequest === null &&
  event.formData === null &&
  event.info !== ReactTransitionNavigationInfo &&
  event.info !== NativeDocumentNavigationInfo &&
  event.navigationType !== 'reload';

export const preserveRequestedHash = (requested: URL, resolved: URL) =>
  resolved.hash === '' &&
  resolved.origin === requested.origin &&
  resolved.pathname === requested.pathname &&
  resolved.search === requested.search
    ? new URL(`${resolved.href}${requested.hash}`)
    : resolved;
