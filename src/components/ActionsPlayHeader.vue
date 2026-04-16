<template>
  <div class="actions-play-header">
    <!--
      Tooltip attrs live on this span, not the button: when :disabled is true, Chromium
      often delivers no pointer events to the button, so hover tooltips never fired.
      Putting tooltip-btn + data-tooltip on a disabled button also failed for the same reason.
    -->
    <span
      class="actions-play-header-tooltip-host tooltip-btn"
      :data-tooltip="tooltip"
    >
      <button
        type="button"
        class="actions-play-header-btn sequential-play-header-btn"
        :disabled="disabled"
        :title="tooltip"
        @click="onClick"
      >
        {{ icon }}
      </button>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { IHeaderParams } from 'ag-grid-community'
import { useCaptionStore, PlaybackMode } from '../stores/captionStore'

const props = defineProps<{ params: IHeaderParams }>()

const store = useCaptionStore()

const icon = computed(() =>
  store.playbackMode === PlaybackMode.SEGMENTS_PLAYING ? '⏸' : '▶️'
)

const tooltip = computed(() => {
  if (store.playbackMode === PlaybackMode.SEGMENTS_PLAYING) {
    return 'Pause playing captions in table order'
  }
  return 'Play captions in table order from the selected or focused row, skipping gaps between them'
})

const disabled = computed(
  () => !store.mediaPath || store.document.segments.length === 0
)

function onClick(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  const fn = props.params.context?.toggleSequentialPlayback as (() => void) | undefined
  fn?.()
}
</script>

<style scoped>
.actions-play-header {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.actions-play-header-tooltip-host {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* ~1.5× vs other toolbar / grid control buttons (14px) — only this header control. */
.actions-play-header-btn {
  padding: 6px 15px;
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 8px;
  cursor: pointer;
  font-size: 21px;
  line-height: 1.2;
  font-weight: 500;
  transition: background 0.15s, border-color 0.15s, opacity 0.15s;
}

.actions-play-header-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.35);
  border-color: rgba(255, 255, 255, 0.85);
}

.actions-play-header-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
