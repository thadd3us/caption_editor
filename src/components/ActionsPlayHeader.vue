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
        :data-state="isSegmentsPlaying ? 'playing' : 'idle'"
        :aria-label="ariaLabel"
        :aria-pressed="isSegmentsPlaying"
        @click="onClick"
      >
        <!--
          Emoji (▶️ / ⏸) are rendered by the platform emoji font and often stay ~same visual
          size regardless of CSS font-size. SVG + explicit width/height scales reliably.
        -->
        <svg
          v-if="isSegmentsPlaying"
          class="actions-play-header-icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
        <svg v-else class="actions-play-header-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
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

const isSegmentsPlaying = computed(
  () => store.playbackMode === PlaybackMode.SEGMENTS_PLAYING
)

const tooltip = computed(() => {
  if (isSegmentsPlaying.value) {
    return 'Pause playing captions in table order'
  }
  return 'Play captions in table order from the selected or focused row, skipping gaps between them'
})

const ariaLabel = computed(() => {
  if (isSegmentsPlaying.value) {
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

/* Prominent “play all in table order” control — larger than per-row play (ActionButtonsCell). */
.actions-play-header-btn {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 56px;
  min-height: 40px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 8px;
  cursor: pointer;
  line-height: 0;
  font-weight: 500;
  transition: background 0.15s, border-color 0.15s, opacity 0.15s;
}

.actions-play-header-icon {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  fill: currentColor;
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
