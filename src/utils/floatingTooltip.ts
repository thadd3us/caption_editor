/**
 * One body-level tooltip for all `[data-tooltip].tooltip-btn` elements so AG Grid
 * and other overflow:hidden ancestors cannot clip. Positions with fixed layout and
 * clamps to the viewport. Optional `data-tooltip-placement="right"` (e.g. finder buttons).
 */
const TOOLTIP_SELECTOR = '[data-tooltip].tooltip-btn'

/** Pointer target can be a #text node (e.g. emoji in a button); Text has no .closest(). */
function pointerEventTargetElement(e: PointerEvent): Element | null {
  const t = e.target
  if (t instanceof Element) return t
  if (t instanceof Text) return t.parentElement
  return null
}

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
    rafId = requestAnimationFrame(() => {
      rafId = 0
      layout()
    })
  }

  function onPointerOver(e: PointerEvent) {
    if (e.pointerType === 'touch') return
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
    hide()
  }

  function onResize() {
    if (activeTrigger) layout()
  }

  /* Capture so AG Grid / inner handlers using stopPropagation do not hide tooltips. */
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
