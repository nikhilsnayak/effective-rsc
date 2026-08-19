import { Toast } from '@base-ui/react/toast';
import { Button } from '@repo/ui/components/button';
import { cn } from '@repo/ui/lib/utils';
import { CircleAlert, CircleCheck, X } from 'lucide-react';

const manager = Toast.createToastManager();

export const toast = {
  success: (message: string) => manager.add({ title: message, type: 'success' }),
  error: (message: string) => manager.add({ title: message, type: 'error' }),
};

export function Toaster() {
  return (
    <Toast.Provider toastManager={manager}>
      <Toast.Portal>
        <Toast.Viewport className='fixed right-4 bottom-4 z-50 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2 outline-none'>
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function ToastList() {
  const { toasts } = Toast.useToastManager();

  return toasts.map((toast) => {
    const Icon = toast.type === 'error' ? CircleAlert : CircleCheck;

    return (
      <Toast.Root
        key={toast.id}
        toast={toast}
        className={cn(
          'flex items-start gap-3 rounded-lg border bg-background p-4 shadow-lg transition-all duration-200 ease-out',
          'data-starting-style:translate-y-3 data-starting-style:opacity-0',
          'data-ending-style:translate-y-3 data-ending-style:opacity-0',
        )}
      >
        <Icon
          className={cn(
            'mt-0.5 size-4 shrink-0',
            toast.type === 'error' ? 'text-destructive' : 'text-success',
          )}
        />
        <Toast.Title className='flex-1 text-sm font-medium' />
        <Toast.Close
          aria-label='Dismiss'
          render={<Button variant='ghost' size='icon-xs' className='text-muted-foreground' />}
        >
          <X />
        </Toast.Close>
      </Toast.Root>
    );
  });
}
