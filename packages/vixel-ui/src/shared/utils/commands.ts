/**
 * Re-export shim — the id-addressed command vocabulary (`EditorCommand`) and its pure
 * reducer (`applyCommand`/`commandLabel`) now live in `@classytic/vixel-schema`, so the
 * SAME reducer runs in the browser store, a Node agent, and a server pipeline without
 * pulling React. This keeps the historical `vixel-ui` import path working.
 */
export { applyCommand, commandLabel } from '@classytic/vixel-schema';
export type { EditorCommand, EditorCommandType } from '@classytic/vixel-schema';
