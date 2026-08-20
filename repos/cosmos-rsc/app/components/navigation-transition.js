import { ViewTransition } from 'react';

export function NavigationTransition({ children }) {
  return (
    <ViewTransition
      default={{
        'navigation-back': 'navigation-back',
        'navigation-forward': 'navigation-forward',
      }}
    >
      {children}
    </ViewTransition>
  );
}
