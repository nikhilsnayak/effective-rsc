// This component can only run on the server
import { cookies } from '#cosmos-rsc/server';
import { NavigationTransition } from '../../components/navigation-transition';

// Simulated database call
async function fetchUserData() {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return {
    id: 1,
    name: 'John Doe',
    email: 'john@example.com',
    preferences: {
      theme: 'light',
      notifications: true,
    },
  };
}

// Simulated API call
async function fetchWeatherData() {
  // Simulate API response since this is a demo
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return {
    location: 'London',
    temperature: 18,
    condition: 'Partly cloudy',
  };
}

// Server-only component with direct database access
async function UserProfile() {
  const userData = await fetchUserData();
  const cookieManager = cookies();
  const lastVisit = cookieManager.get('last_visit');

  return (
    <div className='rounded bg-white p-4 shadow'>
      <h3 className='mb-2 text-lg font-medium'>User Profile</h3>
      <div className='space-y-2 text-gray-600'>
        <p>Name: {userData.name}</p>
        <p>Email: {userData.email}</p>
        <p>Theme: {userData.preferences.theme}</p>
        {lastVisit && (
          <p className='text-sm'>
            Last visit: {new Date(lastVisit).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}

// Server component with API calls
async function WeatherWidget() {
  const weather = await fetchWeatherData();

  return (
    <div className='rounded bg-blue-50 p-4 shadow'>
      <h3 className='mb-2 text-lg font-medium'>Current Weather</h3>
      <div className='space-y-1'>
        <p className='text-gray-600'>Location: {weather.location}</p>
        <p className='text-2xl'>{weather.temperature}°C</p>
        <p className='text-gray-500'>{weather.condition}</p>
      </div>
    </div>
  );
}

export default function ServerComponentsDemo() {
  return (
    <div className='mx-auto max-w-4xl px-4 py-12'>
      <NavigationTransition>
        <h1 className='mb-8 text-3xl font-bold'>Server Components Demo</h1>
      </NavigationTransition>

      <div className='space-y-8'>
        <section>
          <h2 className='mb-4 text-xl font-semibold'>
            Server-Side Data Access
          </h2>
          <p className='mb-6 text-gray-700'>
            These components run exclusively on the server and have direct
            access to server-side resources like databases, file systems, and
            sensitive APIs.
          </p>

          <div className='grid gap-6 md:grid-cols-2'>
            <UserProfile />
            <WeatherWidget />
          </div>
        </section>

        <section>
          <h2 className='mb-4 text-xl font-semibold'>
            About Server Components
          </h2>
          <p className='text-gray-700'>React Server Components enable:</p>
          <ul className='mt-2 ml-6 list-disc space-y-2'>
            <li>
              Direct access to server resources (databases, APIs, filesystem)
            </li>
            <li>Zero client-side JavaScript for server-only components</li>
            <li>Automatic code-splitting and bundle optimization</li>
            <li>Secure handling of sensitive data and tokens</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
