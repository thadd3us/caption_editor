import type { GridApi } from 'ag-grid-community'

/**
 * Deliberately `import(...)` types rather than top-level `import type`.
 *
 * A top-level import of the store into this file makes the store's own type depend on
 * the `Window` interface it augments — any `window.…` reference inside `captionStore.ts`
 * closes the loop. TypeScript resolves that cycle by giving up and inferring
 * `Store<"captions", {}, {}, {}>`, which does not error anywhere: it silently turns every
 * `window.$store.…` in the specs back into an unchecked member access. Whether it
 * triggers depends on which files are in the program, so it reproduces under
 * `tsconfig.node-side.json` and not under `tsconfig.json`.
 *
 * Deferring resolution to the point of use breaks the loop.
 */
type CaptionStore = ReturnType<typeof import('../stores/captionStore').useCaptionStore>
type PreferencesStore = ReturnType<typeof import('../stores/preferencesStore').usePreferencesStore>

/**
 * Globals the app hangs on `window`, for debugging and for the Playwright specs to drive.
 *
 * These were reached through `(window as any).…` at nearly 700 call sites, which is where
 * almost every `no-explicit-any` warning in the repo came from. Declaring them is not
 * only about the warning count: `window.$store.updateSegment(...)` is now checked against
 * the real store, so a spec that calls a renamed action or passes the wrong shape fails
 * the type check instead of failing mysteriously at run time.
 *
 * They are declared in `src/` rather than under `tests/` because both sides use them:
 * `src/main.ts` assigns `$store`, `CaptionTable` assigns `__agGridApi`, and the specs read
 * both. `tsconfig.json` and `tsconfig.node-side.json` each include this file.
 *
 * Everything here is optional. The app only populates these after mount, and a spec may
 * look before that — `window.$store?.…` is the honest way to read them early, and the
 * optionality is what forces that at the call site.
 */
declare global {
  interface Window {
    /** The Pinia caption store. Assigned at the end of `src/main.ts`. */
    $store: CaptionStore
    /** The Pinia preferences store. Assigned alongside `$store`. */
    $preferencesStore: PreferencesStore

    /** AG Grid's API, published by `CaptionTable` once the grid is ready. */
    __agGridApi?: GridApi

    /** Overrides the ASR model in tests, so specs need not download parakeet. */
    __ASR_MODEL_OVERRIDE?: string

    /** Istanbul's counters, present only in instrumented builds. */
    __coverage__?: unknown

    /** Opt-in AG Grid scroll/viewport logging — see `src/utils/captionGridDebug.ts`. */
    __captionGridDebug?: boolean
    __captionGridDebugAttach?: () => void

    /**
     * Test hooks exposed by `App.vue`, so specs can drive menu actions without going
     * through the native menu (which Playwright cannot click into).
     *
     * Non-optional, unlike the `__`-prefixed globals above: `App.vue` assigns all of
     * them unconditionally in `onMounted`, and every spec waits for the app to be ready
     * before touching anything. Marking them optional only bought a `!` at each of
     * twenty call sites.
     */
    openRenameSpeakerDialog: () => void
    openPreferencesDialog: () => void
    handleMenuAsrCaption: () => Promise<void> | void
    handleMenuAsrEmbed: () => Promise<void> | void
    handleMenuOpenFile: () => Promise<void> | void
    handleExternalFileOpen: (filePaths: string[]) => Promise<void> | void
    handleMenuUndo: () => void
    handleMenuRedo: () => void
    showAlert: (options: { title?: string; message: string }) => Promise<void>
    showConfirm: (options: {
      title?: string
      message: string
      confirmText?: string
      cancelText?: string
    }) => Promise<boolean>

    /** Resets `App.vue`'s "already tried auto-load" latch between shared-instance tests. */
    __resetAttemptedAutoLoad?: () => void
  }
}

export {}
