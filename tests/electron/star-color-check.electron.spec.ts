import { sharedElectronTest as test, expect } from '../helpers/shared-electron'

test('filled stars should be gold, empty stars should be grey', async ({ page }) => {
  await page.evaluate(() => {
    const store = (window as any).$store
    store.loadFromFile(JSON.stringify({
      metadata: { id: 'star-test' },
      segments: [
        { id: 's1', startTime: 0, endTime: 1, text: 'Rated segment', rating: 3 }
      ]
    }), 'test.captions_json')
  })

  await page.waitForFunction(() => {
    const api = (window as any).__agGridApi
    if (!api) return false
    let count = 0
    api.forEachNode(() => count++)
    return count >= 1
  }, { timeout: 5000 })
  await page.waitForTimeout(500)

  const colors = await page.evaluate(() => {
    const stars = document.querySelectorAll('.star-rating .star')
    return Array.from(stars).map((s: any) => ({
      filled: s.classList.contains('filled'),
      color: getComputedStyle(s).color
    }))
  })

  // First 3 stars should be gold (#ffd700 = rgb(255, 215, 0))
  for (let i = 0; i < 3; i++) {
    expect(colors[i].filled).toBe(true)
    expect(colors[i].color).toBe('rgb(255, 215, 0)')
  }
  // Last 2 stars should be grey (#999 = rgb(153, 153, 153))
  for (let i = 3; i < 5; i++) {
    expect(colors[i].filled).toBe(false)
    expect(colors[i].color).toBe('rgb(153, 153, 153)')
  }
})
