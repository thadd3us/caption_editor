<template>
  <BaseModal
    :is-open="isOpen"
    title="Preferences"
    max-width="520px"
    @close="emit('close')"
  >
    <div class="preferences-content">
      <section class="preferences-section">
        <h3 class="preferences-section-title">Playback</h3>

        <label class="preference-row">
          <input
            type="checkbox"
            class="preference-checkbox"
            data-testid="pref-pause-while-editing"
            :checked="prefs.preferences.pausePlaybackWhileEditingCaption"
            @change="onToggle('pausePlaybackWhileEditingCaption', $event)"
          />
          <span class="preference-text">
            <span class="preference-label">Pause playback while editing the current caption</span>
            <span class="preference-help">
              When off, the media keeps playing while you edit the caption in the player panel —
              your edit stays attached to the segment you started on.
            </span>
          </span>
        </label>
      </section>
    </div>

    <template #footer>
      <button class="dialog-button dialog-button-primary" @click="emit('close')">Done</button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseModal from './BaseModal.vue'
import { usePreferencesStore } from '../stores/preferencesStore'
import type { AppPreferences } from '../types/preferences'

defineProps<{ isOpen: boolean }>()

const emit = defineEmits<{ close: [] }>()

const prefs = usePreferencesStore()

function onToggle(key: keyof AppPreferences, event: Event) {
  prefs.setPreference(key, (event.target as HTMLInputElement).checked)
}
</script>

<style scoped>
.preferences-content {
  color: var(--text-1);
}

.preferences-section + .preferences-section {
  margin-top: 24px;
}

.preferences-section-title {
  margin: 0 0 12px 0;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-2);
}

.preference-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
}

.preference-checkbox {
  margin-top: 2px;
  flex-shrink: 0;
  cursor: pointer;
}

.preference-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preference-label {
  font-size: 14px;
}

.preference-help {
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.4;
}

.dialog-button {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.dialog-button-primary {
  background: #3a7afe;
  color: #fff;
}

.dialog-button-primary:hover {
  background: #4d8dfa;
}
</style>
