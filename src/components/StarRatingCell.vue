<template>
  <div class="star-rating" :data-rating="rating || 0">
    <span
      v-for="star in 5"
      :key="star"
      class="star"
      :class="{ filled: star <= (rating || 0) }"
      :data-star-index="star"
      @click="handleClick(star)"
    >
      {{ star <= (rating || 0) ? '★' : '☆' }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useVTTStore } from '../stores/vttStore'

interface Props {
  data: {
    id: string
    rating?: number
  }
}

const props = defineProps<Props>()
const store = useVTTStore()

const rating = computed(() => props.data.rating)

function handleClick(star: number) {
  console.log('Star clicked:', star, 'for cue:', props.data.id)

  // If clicking the current rating, clear it
  if (star === rating.value) {
    store.updateCue(props.data.id, { rating: undefined })
  } else {
    store.updateCue(props.data.id, { rating: star })
  }
}
</script>

<style scoped>
.star-rating {
  display: flex;
  gap: 4px;
  padding: 4px 0;
}

.star {
  cursor: pointer;
  font-size: 20px;
  color: #999;
  transition: color 0.2s;
  user-select: none;
}

.star.filled {
  color: #ffd700;
}

.star:hover {
  color: #ffed4e;
}
</style>
