import { type ReactNode, ViewTransition } from 'react';

const navigationClasses = {
  'navigation-backward': 'navigation-backward',
  'navigation-forward': 'navigation-forward',
  'server-function': 'none',
  default: 'none',
} as const;

export function NavigationTransition({ children }: { readonly children: ReactNode }) {
  return (
    <ViewTransition default='none' enter={navigationClasses} exit={navigationClasses}>
      {children}
    </ViewTransition>
  );
}

export function RevealTransition({ children }: { readonly children: ReactNode }) {
  return (
    <ViewTransition default='none' enter='reveal-in' exit='reveal-out'>
      {children}
    </ViewTransition>
  );
}
