import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import StarRatingCell from './StarRatingCell.vue'
import { useVTTStore } from '../stores/vttStore'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    }
  }
})()

global.localStorage = localStorageMock as any

describe('StarRatingCell', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorageMock.clear()
  })

  it('should render 5 stars for unrated cue', () => {
    const wrapper = mount(StarRatingCell, {
      props: {
        data: {
          id: 'test-cue-1',
          rating: undefined
        }
      }
    })

    const stars = wrapper.findAll('.star')
    expect(stars).toHaveLength(5)

    // All stars should be empty (☆) when not rated
    stars.forEach(star => {
      expect(star.text()).toBe('☆')
      expect(star.classes()).not.toContain('filled')
    })
  })

  it('should render correct number of filled stars for rated cue', () => {
    const wrapper = mount(StarRatingCell, {
      props: {
        data: {
          id: 'test-cue-2',
          rating: 3
        }
      }
    })

    const stars = wrapper.findAll('.star')
    expect(stars).toHaveLength(5)

    // First 3 stars should be filled (★)
    for (let i = 0; i < 3; i++) {
      expect(stars[i].text()).toBe('★')
      expect(stars[i].classes()).toContain('filled')
    }

    // Last 2 stars should be empty (☆)
    for (let i = 3; i < 5; i++) {
      expect(stars[i].text()).toBe('☆')
      expect(stars[i].classes()).not.toContain('filled')
    }
  })

  it('should have data-rating attribute on container', () => {
    const wrapper = mount(StarRatingCell, {
      props: {
        data: {
          id: 'test-cue-3',
          rating: 4
        }
      }
    })

    const container = wrapper.find('.star-rating')
    expect(container.attributes('data-rating')).toBe('4')
  })

  it('should have data-star-index attribute on each star', () => {
    const wrapper = mount(StarRatingCell, {
      props: {
        data: {
          id: 'test-cue-4',
          rating: 2
        }
      }
    })

    const stars = wrapper.findAll('.star')
    stars.forEach((star, index) => {
      expect(star.attributes('data-star-index')).toBe(String(index + 1))
    })
  })

  it('should update rating when clicking on an empty star', async () => {
    const store = useVTTStore()
    const updateCueSpy = vi.spyOn(store, 'updateCue')

    const wrapper = mount(StarRatingCell, {
      props: {
        data: {
          id: 'test-cue-5',
          rating: undefined
        }
      }
    })

    // Click on the third star
    const stars = wrapper.findAll('.star')
    await stars[2].trigger('click')

    expect(updateCueSpy).toHaveBeenCalledWith('test-cue-5', { rating: 3 })
  })

  it('should update rating when clicking on a different star', async () => {
    const store = useVTTStore()
    const updateCueSpy = vi.spyOn(store, 'updateCue')

    const wrapper = mount(StarRatingCell, {
      props: {
        data: {
          id: 'test-cue-6',
          rating: 3
        }
      }
    })

    // Click on the fifth star
    const stars = wrapper.findAll('.star')
    await stars[4].trigger('click')

    expect(updateCueSpy).toHaveBeenCalledWith('test-cue-6', { rating: 5 })
  })

  it('should clear rating when clicking on the current rating', async () => {
    const store = useVTTStore()
    const updateCueSpy = vi.spyOn(store, 'updateCue')

    const wrapper = mount(StarRatingCell, {
      props: {
        data: {
          id: 'test-cue-7',
          rating: 4
        }
      }
    })

    // Click on the fourth star (current rating)
    const stars = wrapper.findAll('.star')
    await stars[3].trigger('click')

    expect(updateCueSpy).toHaveBeenCalledWith('test-cue-7', { rating: undefined })
  })

  it('should handle full rating flow: unrated -> rated -> different rating -> cleared', async () => {
    const store = useVTTStore()

    // Add a cue to the store
    store.addCue(1.0, 3.0)
    const cueId = store.document.segments[0].id

    // Mount component with unrated cue
    const wrapper = mount(StarRatingCell, {
      props: {
        data: {
          id: cueId,
          rating: undefined
        }
      }
    })

    let stars = wrapper.findAll('.star')

    // Step 1: Verify initial unrated state (all empty stars)
    expect(wrapper.find('.star-rating').attributes('data-rating')).toBe('0')
    stars.forEach(star => {
      expect(star.text()).toBe('☆')
      expect(star.classes()).not.toContain('filled')
    })

    // Step 2: Click third star to rate it 3
    await stars[2].trigger('click')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (wrapper.setProps as any)({
      data: {
        id: cueId,
        rating: 3
      }
    })

    stars = wrapper.findAll('.star')
    expect(wrapper.find('.star-rating').attributes('data-rating')).toBe('3')
    expect(stars[0].text()).toBe('★')
    expect(stars[1].text()).toBe('★')
    expect(stars[2].text()).toBe('★')
    expect(stars[3].text()).toBe('☆')
    expect(stars[4].text()).toBe('☆')

    // Step 3: Click fifth star to change rating to 5
    await stars[4].trigger('click')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (wrapper.setProps as any)({
      data: {
        id: cueId,
        rating: 5
      }
    })

    stars = wrapper.findAll('.star')
    expect(wrapper.find('.star-rating').attributes('data-rating')).toBe('5')
    stars.forEach(star => {
      expect(star.text()).toBe('★')
      expect(star.classes()).toContain('filled')
    })

    // Step 4: Click fifth star again to clear rating
    await stars[4].trigger('click')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (wrapper.setProps as any)({
      data: {
        id: cueId,
        rating: undefined
      }
    })

    stars = wrapper.findAll('.star')
    expect(wrapper.find('.star-rating').attributes('data-rating')).toBe('0')
    stars.forEach(star => {
      expect(star.text()).toBe('☆')
      expect(star.classes()).not.toContain('filled')
    })
  })

  it('should render all rating values correctly (1-5)', () => {
    for (let rating = 1; rating <= 5; rating++) {
      const wrapper = mount(StarRatingCell, {
        props: {
          data: {
            id: `test-cue-${rating}`,
            rating
          }
        }
      })

      const stars = wrapper.findAll('.star')

      // Check filled stars
      for (let i = 0; i < rating; i++) {
        expect(stars[i].text()).toBe('★')
        expect(stars[i].classes()).toContain('filled')
      }

      // Check empty stars
      for (let i = rating; i < 5; i++) {
        expect(stars[i].text()).toBe('☆')
        expect(stars[i].classes()).not.toContain('filled')
      }

      expect(wrapper.find('.star-rating').attributes('data-rating')).toBe(String(rating))
    }
  })

  it('should handle edge case of rating 0', () => {
    const wrapper = mount(StarRatingCell, {
      props: {
        data: {
          id: 'test-cue-zero',
          rating: 0
        }
      }
    })

    const stars = wrapper.findAll('.star')
    stars.forEach(star => {
      expect(star.text()).toBe('☆')
      expect(star.classes()).not.toContain('filled')
    })

    expect(wrapper.find('.star-rating').attributes('data-rating')).toBe('0')
  })

  it('should work with AG Grid params format', () => {
    const wrapper = mount(StarRatingCell, {
      props: {
        params: {
          data: {
            id: 'test-ag-grid',
            rating: 3
          }
        }
      }
    })

    const stars = wrapper.findAll('.star')
    expect(stars).toHaveLength(5)

    // First 3 stars should be filled
    for (let i = 0; i < 3; i++) {
      expect(stars[i].text()).toBe('★')
      expect(stars[i].classes()).toContain('filled')
    }

    // Last 2 stars should be empty
    for (let i = 3; i < 5; i++) {
      expect(stars[i].text()).toBe('☆')
      expect(stars[i].classes()).not.toContain('filled')
    }

    expect(wrapper.find('.star-rating').attributes('data-rating')).toBe('3')
  })

  it('should handle clicks with AG Grid params format', async () => {
    const store = useVTTStore()
    const updateCueSpy = vi.spyOn(store, 'updateCue')

    const wrapper = mount(StarRatingCell, {
      props: {
        params: {
          data: {
            id: 'test-ag-grid-click',
            rating: 2
          }
        }
      }
    })

    // Click on the fifth star
    const stars = wrapper.findAll('.star')
    await stars[4].trigger('click')

    expect(updateCueSpy).toHaveBeenCalledWith('test-ag-grid-click', { rating: 5 })
  })
})
