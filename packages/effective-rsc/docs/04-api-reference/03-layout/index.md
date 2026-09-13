## Layout

`ERSC.Layout.make({ render })` creates a wrapper whose `render({ children })` returns an Effect
producing React output. It can use application and middleware services. The root Layout must include
`<html>` and `<body>`; nested Layouts wrap their child routes.
