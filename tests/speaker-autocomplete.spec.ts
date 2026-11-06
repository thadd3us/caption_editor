import { sharedElectronTest as test, expect } from './helpers/shared-electron'
import { expectGridCaptionTotal } from './helpers/wait-helpers'

test.describe('Caption Editor - Speaker Name Autocomplete', () => {
  test('should commit an existing speaker name from the cell editor', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'speaker-autocomplete-grid' },
        segments: [
          { id: 'seg1', startTime: 1, endTime: 4, text: 'First', speakerName: 'Alice' },
          { id: 'seg2', startTime: 5, endTime: 8, text: 'Second', speakerName: 'Bob' }
        ]
      }, null, 2)

      store.loadFromFile(captionsContent, '/test/file.captions_json5')
    })

    await expectGridCaptionTotal(page, 2, 2000)

    await page.evaluate(() => {
      const gridApi = (window as any).__agGridApi
      if (!gridApi) throw new Error('Grid API not available')
      gridApi.startEditingCell({
        rowIndex: 0,
        colKey: 'speakerName'
      })
    })

    await page.waitForSelector('.ag-cell-inline-editing', { state: 'visible' })

    const editorInput = page.locator('.speaker-name-editor')
    await expect(editorInput).toBeVisible({ timeout: 5000 })
    await page.evaluate(() => {
      const input = document.querySelector('.speaker-name-editor') as HTMLInputElement | null
      if (!input) throw new Error('speaker-name-editor input not found')
      input.value = 'Bob'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await editorInput.press('Enter')

    await page.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.[0]?.speakerName === 'Bob'
    })
  })

  test('should allow a new speaker name in the cell editor', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'speaker-autocomplete-new' },
        segments: [{ id: 'seg1', startTime: 1, endTime: 4, text: 'First', speakerName: 'Alice' }]
      }, null, 2)

      store.loadFromFile(captionsContent, '/test/file.captions_json5')
    })

    await page.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 1
    })

    await page.evaluate(() => {
      const gridApi = (window as any).__agGridApi
      if (!gridApi) throw new Error('Grid API not available')
      gridApi.startEditingCell({ rowIndex: 0, colKey: 'speakerName' })
    })

    const editorInput = page.locator('.speaker-name-editor')
    await expect(editorInput).toBeVisible({ timeout: 5000 })
    await page.evaluate(() => {
      const input = document.querySelector('.speaker-name-editor') as HTMLInputElement | null
      if (!input) throw new Error('speaker-name-editor input not found')
      input.value = 'Charlie'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await editorInput.press('Enter')

    await page.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.[0]?.speakerName === 'Charlie'
    })
  })
})
