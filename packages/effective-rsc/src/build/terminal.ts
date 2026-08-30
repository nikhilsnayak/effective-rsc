import { styleText } from 'node:util';

export const Terminal = {
  cyan: (text: string) => styleText('cyan', text),
  dim: (text: string) => styleText('dim', text),
  green: (text: string) => styleText('green', text),
  magenta: (text: string) => styleText('magenta', text),
  red: (text: string) => styleText('red', text),
  yellow: (text: string) => styleText('yellow', text),
} as const;

export const formatDuration = (milliseconds: number) =>
  milliseconds < 1_000 ? `${milliseconds} ms` : `${(milliseconds / 1_000).toFixed(2)} s`;
