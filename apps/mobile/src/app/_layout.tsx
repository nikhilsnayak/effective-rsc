/* oxlint-disable effecttsgo/process-env -- Expo exposes public build-time variables through process.env. */
import { RegistryProvider } from '@effect/atom-react';
import { serverUrlAtom } from '@repo/client-runtime/Config';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const serverUrl = process.env['EXPO_PUBLIC_SERVER_URL'];
if (serverUrl === undefined) {
  throw new Error('EXPO_PUBLIC_SERVER_URL is required.');
}

export default function RootLayout() {
  return (
    <RegistryProvider initialValues={[[serverUrlAtom, serverUrl]]}>
      <SafeAreaProvider>
        <Stack />
      </SafeAreaProvider>
    </RegistryProvider>
  );
}
