## Page

- `ERSC.Page.make({ render })` creates a static route leaf.
- `ERSC.Page.make({ params, render })` creates a parameterized route leaf.

`render` returns an Effect whose requirements fit the ERSC service union. For parameterized Pages,
the Schema's encoded keys must exactly match the path parameters and accept strings. Compose the
Page with `Routes.page`.

Pages produce React output. Only an unmatched route receives a native `404`. The mapping from a
matched Page's parameter rejection to an expected HTTP outcome remains a
[known limitation](https://github.com/nikhilsnayak/effective-rsc/blob/main/docs/ARCHITECTURE.md#known-limitations).
