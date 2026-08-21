import { Effect } from 'effect';
import { Page } from 'effective-rsc';

import { Counter } from '../components/counter';
import { Greeting } from '../greeting';

export default Page.make(
  Effect.fn('Page')(function* () {
    yield* Effect.sleep('75 millis');
    const greeting = yield* Greeting;

    return (
      <main className='mx-auto max-w-2xl p-8'>
        <h1 className='text-3xl font-bold'>effective-rsc compiler probe</h1>
        <p className='mt-4'>This text was rendered by a Server Component.</p>
        <p className='mt-2'>{greeting.message}</p>
        <div className='mt-6'>
          <Counter initialCount={1} />
        </div>
      </main>
    );
  }),
);
