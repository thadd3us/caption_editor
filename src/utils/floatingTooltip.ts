/**
 * Global hover tooltips: one `position:fixed` host on `document.body`, driven by
 * `pointerover` / `pointerout` on `[data-tooltip].tooltip-btn`.
 *
 * Why not CSS (::after on the trigger)?
 * - AG Grid uses overflow:hidden on header viewports, rows, and cells; tooltips were
 *   clipped to slivers or the header row box. Setting overflow:visible on pieces of
 *   the grid was fragile and still lost to nested viewports.
 * - `position:absolute` tooltips used the narrow button as shrink-to-fit width, so
 *   long text stacked one word per line until we tried width:max-content — then wide
 *   bubbles were still clipped horizontally by those same ancestors.
 *
 * Why body + getBoundingClientRect?
 * - Escapes all grid clipping; we clamp x/y to the viewport so window edges work.
 *
 * Why not skip tooltips when disabled?
 * - These controls are often disabled (no media, no rows); users still need the copy.
 * - Chromium often does not deliver pointer events to disabled <button>, so putting
 *   `tooltip-btn` only on the button meant no hover at all — use a non-disabled
 *   wrapper in the Vue templates for those cases (see ActionsPlayHeader, CaptionTable).
 *
 * Listener details:
 * - Capture phase: inner code (including AG Grid) may stopPropagation; bubble-only
 *   listeners missed hover on header play / similar.
 * - pointerEventTargetElement: event.target can be a Text node (emoji); Text has no
 *   .closest(), so (target as HTMLElement).closest threw or failed before.
 * - Touch: skipped; no mobile hover affordance here.
 * - Scroll (capture): hide instead of re-anchor — simple; re-layout on scroll could be
 *   a follow-up if we need tooltips to survive grid scroll.
 */
const TOOLTIP_SELECTOR = '[data-tooltip].tooltip-btn'

/** event.target is not always an Element (e.g. #text inside a button); Text has no .closest(). */
function pointerEventTargetElement(e: PointerEvent): Element | null {
  const t = e.target
  if (t instanceof Element) return t
  if (t instanceof Text) return t.parentElement
  return null
}

/* If install runs twice in the same JS realm (e.g. dev), tear down the old host/listeners first. */
let previousCleanup: (() => void) | null = null

export function installFloatingTooltip(): () => void {
  if (typeof document === 'undefined') return () => {}
  previousCleanup?.()
  previousCleanup = null

  const tip = document.createElement('div')
  tip.className = 'floating-tooltip'
  tip.setAttribute('role', 'tooltip')
  tip.style.display = 'none'
  document.body.appendChild(tip)

  let activeTrigger: HTMLElement | null = null
  let rafId = 0

  function hide() {
    cancelAnimationFrame(rafId)
    rafId = 0
    activeTrigger = null
    tip.style.display = 'none'
    tip.textContent = ''
  }

  function layout() {
    if (!activeTrigger) return
    const text = activeTrigger.getAttribute('data-tooltip')
    if (!text) {
      hide()
      return
    }

    tip.textContent = text
    tip.style.display = 'block'
    /* Measure without flashing at (0,0); offsetWidth/Height need layout. */
    tip.style.visibility = 'hidden'
    tip.style.position = 'fixed'
    tip.style.left = '0'
    tip.style.top = '0'

    const tw = tip.offsetWidth
    const th = tip.offsetHeight
    const pad = 8
    const margin = 6
    const vw = window.innerWidth
    const vh = window.innerHeight
    const r = activeTrigger.getBoundingClientRect()
    const placement = activeTrigger.getAttribute('data-tooltip-placement') || 'bottom'

    let left: number
    let top: number

    if (placement === 'right') {
      left = r.right + margin
      top = r.top + r.height / 2 - th / 2
      if (left + tw > vw - pad) {
        left = r.left - margin - tw
      }
      left = Math.min(Math.max(pad, left), vw - pad - tw)
      top = Math.min(Math.max(pad, top), vh - pad - th)
    } else {
      left = r.left + r.width / 2 - tw / 2
      left = Math.min(Math.max(pad, left), vw - pad - tw)
      const spaceBelow = vh - pad - (r.bottom + margin)
      const spaceAbove = r.top - margin - pad
      if (th <= spaceBelow) {
        top = r.bottom + margin
      } else if (th <= spaceAbove) {
        top = r.top - margin - th
      } else {
        top = Math.max(pad, Math.min(r.bottom + margin, vh - pad - th))
      }
    }

    tip.style.left = `${Math.round(left)}px`
    tip.style.top = `${Math.round(top)}px`
    tip.style.visibility = 'visible'
  }

  function scheduleLayout(trigger: HTMLElement) {
    activeTrigger = trigger
    cancelAnimationFrame(rafId)
    /* Coalesce rapid pointerover events (moving across descendants). */
    rafId = requestAnimationFrame(() => {
      rafId = 0
      layout()
    })
  }

  function onPointerOver(e: PointerEvent) {
    if (e.pointerType === 'touch') return /* no hover tooltip UX on touch */
    const found = pointerEventTargetElement(e)?.closest(TOOLTIP_SELECTOR)
    if (!(found instanceof HTMLElement)) return
    scheduleLayout(found)
  }

  function onPointerOut(e: PointerEvent) {
    if (e.pointerType === 'touch') return
    const found = pointerEventTargetElement(e)?.closest(TOOLTIP_SELECTOR)
    if (!(found instanceof HTMLElement)) return
    const trigger = found
    const related = e.relatedTarget as Node | null
    if (!related || !trigger.contains(related)) {
      hide()
    }
  }

  function onScroll() {
    /* Tip uses fixed coords; after scroll it would float wrong — hide (re-hover to show). */
    hide()
  }

  function onResize() {
    if (activeTrigger) layout()
  }

  /* true = capture: bubble listeners never ran when inner handlers called stopPropagation(). */
  document.addEventListener('pointerover', onPointerOver, true)
  document.addEventListener('pointerout', onPointerOut, true)
  document.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', onResize)

  const cleanup = () => {
    document.removeEventListener('pointerover', onPointerOver, true)
    document.removeEventListener('pointerout', onPointerOut, true)
    document.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('resize', onResize)
    hide()
    tip.remove()
    previousCleanup = null
  }
  previousCleanup = cleanup
  return cleanup
}
