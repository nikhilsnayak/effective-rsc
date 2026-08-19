import { Atom } from 'effect/unstable/reactivity';

/**
 * Base URL of the server's RPC endpoint.
 *
 * Applications seed this once through `RegistryProvider`'s `initialValues`, which writes the value
 * to the registry node instead of to the atom. `Atom.keepAlive` is required: without it the
 * registry's idle TTL evicts that node, the next read rebuilds it from the local default below, and
 * device builds silently call `localhost`.
 */
export const serverUrlAtom = Atom.make('http://localhost:8008').pipe(Atom.keepAlive);
