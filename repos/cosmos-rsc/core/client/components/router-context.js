import { createContext, use } from 'react';

export const RouterContext = createContext(null);

export function useRouter() {
  const context = use(RouterContext);
  if (context === null) {
    throw new Error('Router was not mounted');
  }
  return context;
}
