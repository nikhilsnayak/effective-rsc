export default function About() {
  return (
    <section className="panel">
      <p className="eyebrow">About</p>
      <h1>About this demo</h1>
      <p>
        This example deliberately keeps the adaptation small: shared layout
        assets come from a dedicated <code>use server-entry</code> root entry,
        while routing, hydration, and navigation come from React Router&apos;s
        RSC runtime.
      </p>
    </section>
  );
}
