'use client';

import { createContext, use } from 'react';

export const SlotContext = createContext(null);

export function Slot() {
  return use(SlotContext);
}
