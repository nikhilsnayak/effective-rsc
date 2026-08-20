export function getFullPath(url) {
  const { pathname, search, hash } = new URL(url, window.location.origin);
  return `${pathname}${search}${hash}`;
}

export function shouldNotInterceptNavigation(navigationEvent) {
  return (
    !navigationEvent.canIntercept ||
    // If this is just a hashChange,
    // just let the browser handle scrolling to the content.
    navigationEvent.hashChange ||
    // If this is a download,
    // let the browser perform the download.
    navigationEvent.downloadRequest ||
    // If this is a form submission,
    // let that go to the server.
    navigationEvent.formData ||
    // If this is a React transition,
    // let react handle the transition. x-ref: https://github.com/facebook/react/blob/1ea46df8ba9d7d90a13c8668c2642cb21a259aa5/packages/react-dom/src/client/ReactDOMDefaultTransitionIndicator.js#L68
    navigationEvent.info === 'react-transition'
  );
}
