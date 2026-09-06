'use client';

import { Moon, Sun } from 'lucide-react';

import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export function ThemeToggle() {
  const toggle = () => {
    const theme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('ersc-theme', theme);
    } catch {
      // The toggle still works when browser storage is unavailable.
    }
  };
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant='ghost'
            size='icon'
            className='size-10'
            onClick={toggle}
            aria-label='Toggle color theme'
          />
        }
      >
        <Sun className='hidden dark:block' aria-hidden='true' />
        <Moon className='dark:hidden' aria-hidden='true' />
      </TooltipTrigger>
      <TooltipContent>Toggle color theme</TooltipContent>
    </Tooltip>
  );
}
