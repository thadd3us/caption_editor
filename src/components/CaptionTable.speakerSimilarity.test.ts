import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CaptionTable from './CaptionTable.vue'
import { useCaptionStore } from '../stores/captionStore'

function getPartialEmbeddingsCaptionsJson(): string {
  return JSON.stringify({
    metadata: { id: 'doc1' },
    segments: [
      { id: 'segment-with-embedding-1', startTime: 0, endTime: 1, text: 'A' },
      { id: 'segment-without-embedding-1', startTime: 1, endTime: 2, text: 'B' },
      { id: 'segment-with-embedding-2', startTime: 2, endTime: 3, text: 'C' },
      { id: 'segment-without-embedding-2', startTime: 3, endTime: 4, text: 'D' },
      { id: 'segment-with-embedding-3', startTime: 4, endTime: 5, text: 'E' }
    ],
    embeddings: [
      { segmentId: 'segment-with-embedding-1', speakerEmbedding: [1, 0, 0] },
      { segmentId: 'segment-with-embedding-2', speakerEmbedding: [0.9, 0.1, 0] },
      { segmentId: 'segment-with-embedding-3', speakerEmbedding: [0.8, 0.2, 0] }
    ]
  })
}

// Mock AG Grid Vue component
vi.mock('ag-grid-vue3', () => ({
  AgGridVue: {
    name: 'AgGridVue',
    template: '<div class="ag-grid-mock"></div>',
    props: [
      'rowData',
      'columnDefs',
      'defaultColDef',
      'rowSelection',
      'getRowId',
      'immutableData',
      'domLayout',
      'style'
    ]
  }
}))

// Mock the cell renderer components
vi.mock('./StarRatingCell.vue', () => ({
  default: { name: 'StarRatingCell', template: '<div></div>' }
}))

vi.mock('./ActionButtonsCell.vue', () => ({
  default: { name: 'ActionButtonsCell', template: '<div></div>' }
}))

describe('CaptionTable - Speaker Similarity', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should parse captions JSON with partial embeddings', () => {
    const store = useCaptionStore()
    store.loadFromFile(getPartialEmbeddingsCaptionsJson(), '/tmp/partial-embeddings.captions.json')

    // Verify document loaded correctly
    expect(store.document.segments.length).toBe(5)
    expect(store.document.embeddings?.length).toBe(3)

    // Check which segments have embeddings
    const segmentsWithEmbeddings = store.document.segments.filter(segment =>
      store.document.embeddings?.some(e => e.segmentId === segment.id)
    )
    const segmentsWithoutEmbeddings = store.document.segments.filter(segment =>
      !store.document.embeddings?.some(e => e.segmentId === segment.id)
    )

    expect(segmentsWithEmbeddings.length).toBe(3)
    expect(segmentsWithoutEmbeddings.length).toBe(2)

    // Verify specific segments
    expect(segmentsWithEmbeddings.map(s => s.id)).toEqual([
      'segment-with-embedding-1',
      'segment-with-embedding-2',
      'segment-with-embedding-3'
    ])
    expect(segmentsWithoutEmbeddings.map(s => s.id)).toEqual([
      'segment-without-embedding-1',
      'segment-without-embedding-2'
    ])
  })

  it('should compute similarity scores with missing embeddings', () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const store = useCaptionStore()
    store.loadFromFile(getPartialEmbeddingsCaptionsJson(), '/tmp/partial-embeddings.captions.json')

    // Mount component with the same pinia instance
    const wrapper = mount(CaptionTable, {
      global: {
        plugins: [pinia]
      }
    })

    // Get the component instance to access internal functions
    const vm = wrapper.vm as any

    // Mock window.alert
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { })

    // Mock gridApi with necessary methods
    const mockApplyColumnState = vi.fn()
    const mockGetColumn = vi.fn().mockReturnValue({ colId: 'speakerSimilarity' })
    const mockRefreshCells = vi.fn()
    const mockSetColumnsVisible = vi.fn()
    const mockGetSelectedRows = vi.fn().mockReturnValue([
      { id: 'segment-with-embedding-1' }
    ])

    vm.gridApi = {
      getSelectedRows: mockGetSelectedRows,
      refreshCells: mockRefreshCells,
      applyColumnState: mockApplyColumnState,
      getColumn: mockGetColumn,
      setColumnsVisible: mockSetColumnsVisible,
      ensureIndexVisible: vi.fn()
    }

    // Call computeSpeakerSimilarity
    vm.computeSpeakerSimilarity()

    // Check that similarity scores were computed
    expect(vm.speakerSimilarityScores.size).toBe(5)

    // Segments with embeddings should have similarity scores
    const seg1Score = vm.speakerSimilarityScores.get('segment-with-embedding-1')
    const seg2Score = vm.speakerSimilarityScores.get('segment-with-embedding-2')
    const seg3Score = vm.speakerSimilarityScores.get('segment-with-embedding-3')

    expect(seg1Score).toBeGreaterThan(0)
    expect(seg2Score).toBeGreaterThan(0)
    expect(seg3Score).toBeGreaterThan(0)

    // Segments without embeddings should have 0 similarity
    const segNoEmbed1 = vm.speakerSimilarityScores.get('segment-without-embedding-1')
    const segNoEmbed2 = vm.speakerSimilarityScores.get('segment-without-embedding-2')

    expect(segNoEmbed1).toBe(0)
    expect(segNoEmbed2).toBe(0)

    // Verify auto-sort was called
    expect(mockApplyColumnState).toHaveBeenCalledWith({
      state: [{ colId: 'speakerSimilarity', sort: 'desc' }],
      defaultState: { sort: null }
    })

    alertSpy.mockRestore()
  })

  it('should show error when selecting row without embedding', () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const store = useCaptionStore()
    store.loadFromFile(getPartialEmbeddingsCaptionsJson(), '/tmp/partial-embeddings.captions.json')

    // Mount component with the same pinia instance
    const wrapper = mount(CaptionTable, {
      global: {
        plugins: [pinia]
      }
    })

    // Get the component instance
    const vm = wrapper.vm as any

    // Mock window.showAlert
    const showAlertSpy = vi.fn()
      ; (window as any).showAlert = showAlertSpy

    // Mock gridApi
    const mockGetSelectedRows = vi.fn().mockReturnValue([
      { id: 'segment-without-embedding-1' }  // This row has no embedding
    ])

    vm.gridApi = {
      getSelectedRows: mockGetSelectedRows,
      refreshCells: vi.fn(),
      applyColumnState: vi.fn(),
      getColumn: vi.fn()
    }

    // Call computeSpeakerSimilarity
    vm.computeSpeakerSimilarity()

    // Verify showAlert was called with error message
    expect(showAlertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('selected row(s) are missing speaker embeddings')
      })
    )

    // Verify no similarity scores were computed
    expect(vm.speakerSimilarityScores.size).toBe(0)

    delete (window as any).showAlert
  })

  it('should show error when selecting multiple rows where some lack embeddings', () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const store = useCaptionStore()
    store.loadFromFile(getPartialEmbeddingsCaptionsJson(), '/tmp/partial-embeddings.captions.json')

    // Mount component with the same pinia instance
    const wrapper = mount(CaptionTable, {
      global: {
        plugins: [pinia]
      }
    })

    // Get the component instance
    const vm = wrapper.vm as any

    // Mock window.showAlert
    const showAlertSpy = vi.fn()
      ; (window as any).showAlert = showAlertSpy

    // Mock gridApi - select one with embedding and one without
    const mockGetSelectedRows = vi.fn().mockReturnValue([
      { id: 'segment-with-embedding-1' },
      { id: 'segment-without-embedding-1' }
    ])

    vm.gridApi = {
      getSelectedRows: mockGetSelectedRows,
      refreshCells: vi.fn(),
      applyColumnState: vi.fn(),
      getColumn: vi.fn()
    }

    // Call computeSpeakerSimilarity
    vm.computeSpeakerSimilarity()

    // Verify showAlert was called (both rows have issues in this case)
    expect(showAlertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('selected row(s) are missing speaker embeddings')
      })
    )

    // Verify no similarity scores were computed
    expect(vm.speakerSimilarityScores.size).toBe(0)

    delete (window as any).showAlert
  })

  it('should compute cosine similarity correctly', () => {
    const wrapper = mount(CaptionTable, {
      global: {
        plugins: [createPinia()]
      }
    })

    const vm = wrapper.vm as any

    // Test identical vectors (should be 1.0)
    const vec1 = [1, 0, 0, 0]
    const result1 = vm.cosineSimilarity(vec1, vec1)
    expect(result1).toBeCloseTo(1.0, 5)

    // Test orthogonal vectors (should be 0.0)
    const vec2 = [1, 0, 0, 0]
    const vec3 = [0, 1, 0, 0]
    const result2 = vm.cosineSimilarity(vec2, vec3)
    expect(result2).toBeCloseTo(0.0, 5)

    // Test opposite vectors (should be -1.0)
    const vec4 = [1, 0, 0, 0]
    const vec5 = [-1, 0, 0, 0]
    const result3 = vm.cosineSimilarity(vec4, vec5)
    expect(result3).toBeCloseTo(-1.0, 5)

    // Test partial similarity
    const vec6 = [0.5, 0.5, 0.5, 0.5]
    const vec7 = [0.8, 0.8, 0.8, 0.8]
    const result4 = vm.cosineSimilarity(vec6, vec7)
    expect(result4).toBeCloseTo(1.0, 5)  // Same direction, different magnitude
  })

  it('should find correct segment by time regardless of table sort order', () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const store = useCaptionStore()

    // Create segments with specific time ranges
    // Add in reverse chronological order to test that it doesn't matter
    const seg3Id = store.addSegment(20, 10)  // 20-30s
    const seg2Id = store.addSegment(10, 10)  // 10-20s
    const seg1Id = store.addSegment(0, 10)   // 0-10s

    // Update segments with distinct text for verification
    store.updateSegment(seg1Id, { text: 'First segment (0-10s)' })
    store.updateSegment(seg2Id, { text: 'Second segment (10-20s)' })
    store.updateSegment(seg3Id, { text: 'Third segment (20-30s)' })

    // Verify segments are sorted by time in the document model (regardless of insertion order)
    expect(store.document.segments[0].id).toBe(seg1Id)
    expect(store.document.segments[1].id).toBe(seg2Id)
    expect(store.document.segments[2].id).toBe(seg3Id)

    // Test seeking to different positions
    store.setCurrentTime(5)  // Should find first segment
    expect(store.currentSegment?.id).toBe(seg1Id)
    expect(store.currentSegment?.text).toBe('First segment (0-10s)')

    store.setCurrentTime(15)  // Should find second segment
    expect(store.currentSegment?.id).toBe(seg2Id)
    expect(store.currentSegment?.text).toBe('Second segment (10-20s)')

    store.setCurrentTime(25)  // Should find third segment
    expect(store.currentSegment?.id).toBe(seg3Id)
    expect(store.currentSegment?.text).toBe('Third segment (20-30s)')

    // Mount component to test that rowData is also sorted correctly
    const wrapper = mount(CaptionTable, {
      global: {
        plugins: [pinia]
      }
    })

    const vm = wrapper.vm as any

    // Verify rowData (displayed in grid) is sorted by time
    expect(vm.rowData.length).toBe(3)
    expect(vm.rowData[0].id).toBe(seg1Id)
    expect(vm.rowData[1].id).toBe(seg2Id)
    expect(vm.rowData[2].id).toBe(seg3Id)

    // Simulate sorting the grid by a different column (e.g., text in reverse)
    // AG Grid would handle the visual sorting, but the underlying data remains time-sorted
    // The key point: currentSegment lookup still works correctly because it uses document.segments

    // Test that seeking still works after "sorting" (which only affects display, not data)
    store.setCurrentTime(2)  // Should still find first segment
    expect(store.currentSegment?.id).toBe(seg1Id)

    store.setCurrentTime(12)  // Should still find second segment
    expect(store.currentSegment?.id).toBe(seg2Id)

    store.setCurrentTime(28)  // Should still find third segment
    expect(store.currentSegment?.id).toBe(seg3Id)

    // Test edge cases
    store.setCurrentTime(0)  // Exactly at start
    expect(store.currentSegment?.id).toBe(seg1Id)

    store.setCurrentTime(10)  // Exactly at boundary (should find second segment)
    expect(store.currentSegment?.id).toBe(seg2Id)

    store.setCurrentTime(35)  // Beyond all segments
    expect(store.currentSegment).toBeUndefined()
  })
})
