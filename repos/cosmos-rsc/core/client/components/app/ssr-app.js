import { RouterContext } from '../router-context.js';
import { SlotContext } from '../slot-context.js';

export function SSRApp({ initialState, rootLayout }) {
  const router = {
    push: () => {
      throw new Error('Cannot call `router.push` during SSR');
    },
  };

  return (
    <RouterContext value={router}>
      <SlotContext value={initialState.tree}>{rootLayout}</SlotContext>
    </RouterContext>
  );
}
