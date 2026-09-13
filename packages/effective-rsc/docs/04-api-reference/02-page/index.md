## Page

`ERSC.Page.make({ render })` defines a static Page. Add `params` to decode path parameters:
`ERSC.Page.make({ params, render })`. Attach it with `routes.page(path, page)`.

`render` returns an Effect producing React output. Its service requirements must be available from
the application or the Page's middleware view. Parameter Schemas must encode exactly the path's
parameter names as strings; `render({ params })` receives their decoded values.

Rejected parameters return `404` on page loads and navigation. During a mutation refresh, rejection
is a React render error and preserves the completed Server Function result.
