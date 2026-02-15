// Canonical store entrypoint (preferred import path).
//
// Historical note: this store used to be called `vttStore`. Keep the underlying
// implementation in `vttStore.ts` for now, but migrate imports to this module.

export { PlaybackMode, useCaptionStore } from './vttStore'

