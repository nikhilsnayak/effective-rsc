## Page

- `ERSC.Page.make({ render })` creates a static route leaf.
- `ERSC.Page.make({ params, render })` creates a parameterized route leaf.

`render` returns an Effect whose requirements fit the ERSC service union. For parameterized Pages,
the Schema's encoded keys must exactly match the path parameters and accept strings. Compose the
Page with `Routes.page`.

Pages currently produce React output only. They do not expose status, not-found, or redirect
outcomes. Only an unmatched route receives a native `404`.
