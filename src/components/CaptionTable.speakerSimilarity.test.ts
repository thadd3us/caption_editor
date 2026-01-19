import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CaptionTable from './CaptionTable.vue'
import { useVTTStore } from '../stores/vttStore'
import fs from 'fs'
import path from 'path'

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

  it('should parse VTT file with partial embeddings', () => {
    const store = useVTTStore()
    const vttPath = path.join(process.cwd(), 'test_data', 'partial-embeddings.vtt')
    const content = fs.readFileSync(vttPath, 'utf-8')

    store.loadFromFile(content, vttPath)

    // Verify document loaded correctly
    expect(store.document.segments.length).toBe(5)
    expect(store.document.embeddings?.length).toBe(3)

    // Check which cues have embeddings
    const cuesWithEmbeddings = store.document.segments.filter(cue =>
      store.document.embeddings?.some(e => e.segmentId === cue.id)
    )
    const cuesWithoutEmbeddings = store.document.segments.filter(cue =>
      !store.document.embeddings?.some(e => e.segmentId === cue.id)
    )

    expect(cuesWithEmbeddings.length).toBe(3)
    expect(cuesWithoutEmbeddings.length).toBe(2)

    // Verify specific cues
    expect(cuesWithEmbeddings.map(c => c.id)).toEqual([
      'cue-with-embedding-1',
      'cue-with-embedding-2',
      'cue-with-embedding-3'
    ])
    expect(cuesWithoutEmbeddings.map(c => c.id)).toEqual([
      'cue-without-embedding-1',
      'cue-without-embedding-2'
    ])
  })

  it('should compute similarity scores with missing embeddings', () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const store = useVTTStore()
    const vttPath = path.join(process.cwd(), 'test_data', 'partial-embeddings.vtt')
    const content = fs.readFileSync(vttPath, 'utf-8')

    store.loadFromFile(content, vttPath)

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
      { id: 'cue-with-embedding-1' }
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

    // Cues with embeddings should have similarity scores
    const cue1Score = vm.speakerSimilarityScores.get('cue-with-embedding-1')
    const cue2Score = vm.speakerSimilarityScores.get('cue-with-embedding-2')
    const cue3Score = vm.speakerSimilarityScores.get('cue-with-embedding-3')

    expect(cue1Score).toBeGreaterThan(0)
    expect(cue2Score).toBeGreaterThan(0)
    expect(cue3Score).toBeGreaterThan(0)

    // Cues without embeddings should have 0 similarity
    const cueNoEmbed1 = vm.speakerSimilarityScores.get('cue-without-embedding-1')
    const cueNoEmbed2 = vm.speakerSimilarityScores.get('cue-without-embedding-2')

    expect(cueNoEmbed1).toBe(0)
    expect(cueNoEmbed2).toBe(0)

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

    const store = useVTTStore()
    const vttPath = path.join(process.cwd(), 'test_data', 'partial-embeddings.vtt')
    const content = fs.readFileSync(vttPath, 'utf-8')

    store.loadFromFile(content, vttPath)

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
      { id: 'cue-without-embedding-1' }  // This row has no embedding
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

    const store = useVTTStore()
    const vttPath = path.join(process.cwd(), 'test_data', 'partial-embeddings.vtt')
    const content = fs.readFileSync(vttPath, 'utf-8')

    store.loadFromFile(content, vttPath)

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
      { id: 'cue-with-embedding-1' },
      { id: 'cue-without-embedding-1' }
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

  it('should find correct cue by time regardless of table sort order', () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const store = useVTTStore()

    // Create cues with specific time ranges
    // Add in reverse chronological order to test that it doesn't matter
    const cue3Id = store.addCue(20, 10)  // 20-30s
    const cue2Id = store.addCue(10, 10)  // 10-20s
    const cue1Id = store.addCue(0, 10)   // 0-10s

    // Update cues with distinct text for verification
    store.updateCue(cue1Id, { text: 'First cue (0-10s)' })
    store.updateCue(cue2Id, { text: 'Second cue (10-20s)' })
    store.updateCue(cue3Id, { text: 'Third cue (20-30s)' })

    // Verify cues are sorted by time in the document model (regardless of insertion order)
    expect(store.document.segments[0].id).toBe(cue1Id)
    expect(store.document.segments[1].id).toBe(cue2Id)
    expect(store.document.segments[2].id).toBe(cue3Id)

    // Test seeking to different positions
    store.setCurrentTime(5)  // Should find first cue
    expect(store.currentCue?.id).toBe(cue1Id)
    expect(store.currentCue?.text).toBe('First cue (0-10s)')

    store.setCurrentTime(15)  // Should find second cue
    expect(store.currentCue?.id).toBe(cue2Id)
    expect(store.currentCue?.text).toBe('Second cue (10-20s)')

    store.setCurrentTime(25)  // Should find third cue
    expect(store.currentCue?.id).toBe(cue3Id)
    expect(store.currentCue?.text).toBe('Third cue (20-30s)')

    // Mount component to test that rowData is also sorted correctly
    const wrapper = mount(CaptionTable, {
      global: {
        plugins: [pinia]
      }
    })

    const vm = wrapper.vm as any

    // Verify rowData (displayed in grid) is sorted by time
    expect(vm.rowData.length).toBe(3)
    expect(vm.rowData[0].id).toBe(cue1Id)
    expect(vm.rowData[1].id).toBe(cue2Id)
    expect(vm.rowData[2].id).toBe(cue3Id)

    // Simulate sorting the grid by a different column (e.g., text in reverse)
    // AG Grid would handle the visual sorting, but the underlying data remains time-sorted
    // The key point: currentCue lookup still works correctly because it uses document.segments

    // Test that seeking still works after "sorting" (which only affects display, not data)
    store.setCurrentTime(2)  // Should still find first cue
    expect(store.currentCue?.id).toBe(cue1Id)

    store.setCurrentTime(12)  // Should still find second cue
    expect(store.currentCue?.id).toBe(cue2Id)

    store.setCurrentTime(28)  // Should still find third cue
    expect(store.currentCue?.id).toBe(cue3Id)

    // Test edge cases
    store.setCurrentTime(0)  // Exactly at start
    expect(store.currentCue?.id).toBe(cue1Id)

    store.setCurrentTime(10)  // Exactly at boundary (should find second cue)
    expect(store.currentCue?.id).toBe(cue2Id)

    store.setCurrentTime(35)  // Beyond all cues
    expect(store.currentCue).toBeUndefined()
  })
})
