## Client navigation

Use ordinary `<a href>` links. ERSC uses the Navigation API and `NavigationPrecommitController`
when available. Other browsers use full-page navigation while Client Components, Server Functions,
and HMR still work. Without JavaScript, links and native forms remain usable.

The shared Layout stays mounted across client navigation. URL, history, focus, and default scroll
advance when the destination first appears; suspended content can continue streaming afterward.
The current page stays visible while its replacement loads. Later render failures go to React Error
Boundaries.

Back/Forward can reuse completed route trees. New navigations fetch fresh content, and mutations
invalidate that history cache. Redirects follow their destination; responses that cannot be rendered
as a route fall back to full-document navigation.

**Scroll limitation:** history restoration may clamp a saved position against a Loading fallback
and keep that position after content arrives. Stream-aware restoration is not implemented.

### React View Transitions

Add React `<ViewTransition>` boundaries and CSS in your application. ERSC supplies these additive
types when it first publishes a navigation or refresh:

| Event                              | Types                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| Routed navigation                  | `navigation`, plus `navigation-push`, `navigation-replace`, or `navigation-traverse` |
| Push or forward history traversal  | `navigation-forward`                                                                 |
| Backward history traversal         | `navigation-backward`                                                                |
| Browser-provided visual transition | `navigation-ua-visual-transition`                                                    |
| Mutation refresh                   | `server-function`                                                                    |
| HMR refresh                        | `hmr-refresh`                                                                        |

Replace has no direction type. Traversal adds one only when history indices establish a direction.
Choose whether to animate HMR or browser-provided transitions. Suspense reveals that arrive later
need their own boundaries and styling; they do not inherit these types.

Add application types to a link:

```tsx
<a href='/photos/2' data-ersc-transition-types='photo-next'>
  Next photo
</a>
```

Separate multiple types with spaces. They supplement built-in types for that push or replace and
are not replayed on Back/Forward. `navigation`, `navigation-*`, `server-function`, and `hmr-refresh`
are reserved and ignored in the attribute.
