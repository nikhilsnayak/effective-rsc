import { Suspense } from 'react';
import { NavigationTransition } from '../../components/navigation-transition';

// Simulated slow data fetching component
async function SlowData({ delay, label }) {
  await new Promise((resolve) => setTimeout(resolve, delay));
  return (
    <div className='rounded bg-white p-4 shadow'>
      <h3 className='font-medium'>{label}</h3>
      <p>Data loaded after {delay}ms</p>
    </div>
  );
}

// Loading fallback component
function LoadingCard() {
  return (
    <div className='animate-pulse rounded bg-gray-50 p-4 shadow'>
      <div className='mb-2 h-4 w-1/4 rounded bg-gray-200'></div>
      <div className='h-4 w-3/4 rounded bg-gray-200'></div>
    </div>
  );
}

export default function StreamingDemo() {
  return (
    <div className='mx-auto max-w-4xl px-4 py-12'>
      <NavigationTransition>
        <h1 className='mb-8 text-3xl font-bold'>Streaming SSR Demo</h1>
      </NavigationTransition>

      <div className='space-y-8'>
        <section>
          <h2 className='mb-4 text-xl font-semibold'>Progressive Loading</h2>
          <p className='mb-6 text-gray-700'>
            This page demonstrates streaming server-side rendering with
            Suspense. Each component below loads after a different delay, but
            the page remains interactive throughout the loading process.
          </p>

          <div className='grid gap-4'>
            <Suspense fallback={<LoadingCard />}>
              <SlowData delay={1000} label='Fast Component' />
            </Suspense>

            <Suspense fallback={<LoadingCard />}>
              <SlowData delay={3000} label='Medium Component' />
            </Suspense>

            <Suspense fallback={<LoadingCard />}>
              <SlowData delay={5000} label='Slow Component' />
            </Suspense>
          </div>
        </section>

        <section>
          <h2 className='mb-4 text-xl font-semibold'>About Streaming SSR</h2>
          <p className='text-gray-700'>Streaming SSR allows the server to:</p>
          <ul className='mt-2 ml-6 list-disc space-y-2'>
            <li>Send the initial HTML immediately</li>
            <li>Stream in component content as it becomes available</li>
            <li>Show loading states with Suspense boundaries</li>
            <li>Keep the page interactive during loading</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
