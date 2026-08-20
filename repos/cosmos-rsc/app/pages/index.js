import { NavigationTransition } from '../components/navigation-transition';

export default function Page() {
  return (
    <div className='mx-auto max-w-4xl px-4 py-12'>
      <NavigationTransition>
        <h1 className='mb-8 text-4xl font-bold'>COSMOS RSC Features</h1>
      </NavigationTransition>
      <div className='space-y-6'>
        <section>
          <h2 className='mb-4 text-2xl font-semibold'>
            Feature Demonstrations
          </h2>
          <ul className='space-y-3'>
            <li>
              <a
                href='/features/server-components'
                className='text-blue-600 hover:underline'
              >
                Server Components Demo
              </a>
              <p className='mt-1 text-gray-600'>
                Showcase of React Server Components with async data fetching
              </p>
            </li>
            <li>
              <a
                href='/features/streaming'
                className='text-blue-600 hover:underline'
              >
                Streaming SSR Demo
              </a>
              <p className='mt-1 text-gray-600'>
                Server-side streaming rendering with Suspense
              </p>
            </li>
            <li>
              <a
                href='/features/forms'
                className='text-blue-600 hover:underline'
              >
                Server Actions Form Demo
              </a>
              <p className='mt-1 text-gray-600'>
                Form handling with server actions
              </p>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
