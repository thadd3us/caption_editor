import type { GridApi } from 'ag-grid-community'

const LS_KEY = 'captionDebugGrid'
const WIN_FLAG = '__captionGridDebug'
const ATTACH_FN = '__captionGridDebugAttach'

export function isCaptionGridDebugEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false
    const w = window as unknown as { [WIN_FLAG]?: boolean }
    if (w[WIN_FLAG] === true) return true
    return window.localStorage.getItem(LS_KEY) === '1'
  } catch {
    return false
  }
}

export type CaptionGridDebugStoreSnapshot = {
  currentTime: number
  selectedSegmentId: string | null
}

function readViewport(): { scrollTop: number | null; clientHeight: number | null } {
  const vp = document.querySelector('.ag-body-viewport') as HTMLElement | null
  if (!vp) return { scrollTop: null, clientHeight: null }
  return { scrollTop: vp.scrollTop, clientHeight: vp.clientHeight }
}

function logSnapshot(
  api: GridApi,
  store: CaptionGridDebugStoreSnapshot,
  reason: string,
  extra?: Record<string, unknown>
) {
  const { scrollTop, clientHeight } = readViewport()
  const topNode = api.getDisplayedRowAtIndex?.(0)
  const fc = api.getFocusedCell?.()
  const sel = api.getSelectedNodes?.() ?? []
  console.log('[CaptionGridDebug]', reason, {
    scrollTop,
    clientHeight,
    topDisplayedId: topNode?.data?.id ?? null,
    topDisplayedIndex: topNode?.data?.index ?? null,
    currentTime: store.currentTime,
    selectedSegmentId: store.selectedSegmentId,
    focused: fc
      ? { rowIndex: fc.rowIndex, colId: fc.column?.getColId?.() }
      : null,
    selectedRowIndexes: sel.map((n) => n.rowIndex),
    selectedIds: sel.map((n) => n.data?.id),
    sort: api.getColumnState?.()?.filter((c) => c.sort),
    ...extra,
  })
}

/**
 * Opt-in verbose logging for AG Grid scroll / layout issues (works in production).
 *
 * Enable either:
 * - `localStorage.setItem('captionDebugGrid', '1')` then reload, or
 * - `window.__captionGridDebug = true` before the grid mounts, or set it then run
 *   `window.__captionGridDebugAttach()` if the grid is already ready.
 */
export function attachCaptionGridDebug(
  api: GridApi,
  getStoreSnapshot: () => CaptionGridDebugStoreSnapshot
): () => void {
  const disposers: Array<() => void> = []

  const snap = (reason: string, extra?: Record<string, unknown>) =>
    logSnapshot(api, getStoreSnapshot(), reason, extra)

  snap('attachCaptionGridDebug: session started')

  const onColumnResized = (e: { finished?: boolean; source?: string; column?: { getColId: () => string } }) => {
    if (e.finished === false) return
    snap('columnResized (finished)', {
      colId: e.column?.getColId?.(),
      source: e.source,
      finished: e.finished,
    })
  }
  api.addEventListener('columnResized', onColumnResized as never)
  disposers.push(() => api.removeEventListener('columnResized', onColumnResized as never))

  let modelRaf = 0
  const onModelUpdated = () => {
    if (modelRaf) return
    modelRaf = requestAnimationFrame(() => {
      modelRaf = 0
      snap('modelUpdated (coalesced per frame)')
    })
  }
  api.addEventListener('modelUpdated', onModelUpdated)
  disposers.push(() => {
    if (modelRaf) cancelAnimationFrame(modelRaf)
    modelRaf = 0
    api.removeEventListener('modelUpdated', onModelUpdated)
  })

  let lastFocusKey = ''
  const onCellFocused = (e: { rowIndex: number | null; column?: { getColId: () => string } }) => {
    const key = `${e.rowIndex}:${e.column?.getColId?.() ?? ''}`
    if (key === lastFocusKey) return
    lastFocusKey = key
    snap('cellFocused', {
      rowIndex: e.rowIndex,
      colId: e.column?.getColId?.(),
    })
  }
  api.addEventListener('cellFocused', onCellFocused as never)
  disposers.push(() => api.removeEventListener('cellFocused', onCellFocused as never))

  let lastScrollTop = Number.NaN
  let scrollTimer: ReturnType<typeof setTimeout> | null = null
  const vp = () => document.querySelector('.ag-body-viewport') as HTMLElement | null
  const onViewportScroll = () => {
    const el = vp()
    if (!el) return
    if (scrollTimer) return
    scrollTimer = setTimeout(() => {
      scrollTimer = null
      const st = el.scrollTop
      if (!Number.isNaN(lastScrollTop) && Math.abs(st - lastScrollTop) < 1) return
      const delta = Number.isNaN(lastScrollTop) ? null : st - lastScrollTop
      lastScrollTop = st
      snap('viewport scroll (debounced 120ms)', { scrollTop: st, delta })
    }, 120)
  }
  const el = vp()
  if (el) {
    el.addEventListener('scroll', onViewportScroll, { passive: true })
    disposers.push(() => el.removeEventListener('scroll', onViewportScroll))
  }

  return () => {
    disposers.forEach((d) => d())
    snap('attachCaptionGridDebug: detached')
  }
}

export function exposeCaptionGridDebugAttach(
  attach: () => void,
  isEnabled: () => boolean
): void {
  if (typeof window === 'undefined') return
  ;(window as unknown as Record<string, unknown>)[ATTACH_FN] = () => {
    if (!isEnabled()) {
      console.warn(
        `[CaptionGridDebug] enable first: localStorage.setItem('${LS_KEY}','1') and reload, or window.${WIN_FLAG} = true`
      )
      return
    }
    attach()
  }
}
