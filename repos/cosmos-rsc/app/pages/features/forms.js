import { cookies } from '#cosmos-rsc/server';
import { NavigationTransition } from '../../components/navigation-transition';
import { contactAction } from '../../actions/form-actions';
import { SubmitButton } from '../../components/submit-button';

export default function FormsDemo() {
  const cookieManager = cookies();
  const lastSubmission = cookieManager.get('last_submission');

  return (
    <div className='mx-auto max-w-4xl px-4 py-12'>
      <NavigationTransition>
        <h1 className='mb-8 text-3xl font-bold'>Server Actions Form Demo</h1>
      </NavigationTransition>

      <a href='/' className='text-blue-500 hover:underline'>
        Back to Home
      </a>

      <div className='space-y-8'>
        {lastSubmission && (
          <div className='text-sm text-gray-600'>
            Last form submission: {new Date(lastSubmission).toLocaleString()}
          </div>
        )}

        <section>
          <h2 className='mb-4 text-xl font-semibold'>Contact Form Example</h2>
          <p className='mb-6 text-gray-700'>
            This form demonstrates server actions by handling form submissions
            on the server without client-side JavaScript.
          </p>

          <form action={contactAction} className='max-w-lg space-y-4'>
            <div>
              <label
                htmlFor='name'
                className='block text-sm font-medium text-gray-700'
              >
                Name
              </label>
              <input
                type='text'
                id='name'
                name='name'
                className='mt-1 block w-full rounded-md border-gray-300 px-4 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500'
              />
            </div>

            <div>
              <label
                htmlFor='email'
                className='block text-sm font-medium text-gray-700'
              >
                Email
              </label>
              <input
                type='text'
                id='email'
                name='email'
                className='mt-1 block w-full rounded-md border-gray-300 px-4 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500'
              />
            </div>

            <div>
              <label
                htmlFor='message'
                className='block text-sm font-medium text-gray-700'
              >
                Message
              </label>
              <textarea
                id='message'
                name='message'
                rows={4}
                className='mt-1 block w-full rounded-md border-gray-300 px-4 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500'
              ></textarea>
            </div>

            <SubmitButton>Submit</SubmitButton>
          </form>
        </section>

        <section>
          <h2 className='mb-4 text-xl font-semibold'>About Server Actions</h2>
          <p className='text-gray-700'>
            Server Actions allow forms to be handled directly on the server
            without needing client-side JavaScript or API endpoints. This demo
            showcases:
          </p>
          <ul className='mt-2 ml-6 list-disc space-y-2'>
            <li>Module-level server actions (defined in a separate file)</li>
            <li>Cookie storage for tracking last submission time</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
