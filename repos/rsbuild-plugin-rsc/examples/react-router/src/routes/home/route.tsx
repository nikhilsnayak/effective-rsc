import { getCount } from './actions';
import { Counter } from './counter';

export default async function Home() {
  const count = await getCount();

  return (
    <section className="hero">
      <div>
        <p className="eyebrow">React Router RSC Data Mode</p>
        <h1>React Router RSC on Rsbuild</h1>
      </div>
      <p>
        This route is rendered through React Router&apos;s RSC Data Mode APIs
        while Rsbuild and Rspack still own the RSC compilation pipeline. Client
        navigations stay inside the router and server actions round-trip through
        the RSC transport.
      </p>
      <Counter count={count} />
    </section>
  );
}
