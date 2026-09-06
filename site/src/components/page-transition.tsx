import { ViewTransition, type ReactNode } from 'react';

const navigationClasses = {
  default: 'none',
  'navigation-forward': 'navigation-forward',
  'navigation-backward': 'navigation-backward',
  'docs-next': 'navigation-forward',
  'docs-previous': 'navigation-backward',
  'docs-jump': 'navigation-jump',
  'server-function': 'none',
  'navigation-ua-visual-transition': 'none',
  'hmr-refresh': 'none',
};

export function PageTransition({ children }: { readonly children: ReactNode }) {
  return (
    <ViewTransition default='none' enter={navigationClasses} exit={navigationClasses}>
      {children}
    </ViewTransition>
  );
}
