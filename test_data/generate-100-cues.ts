import { v4 as uuidv4 } from 'uuid'
import * as fs from 'fs'
import * as path from 'path'

// Generate 100 one-second segments numbered 0-99
const segments = []
for (let i = 0; i < 100; i++) {
  segments.push({
    id: uuidv4(),
    startTime: i,
    endTime: i + 1,
    text: `${i}`,
    rating: undefined
  })
}

const doc = {
  metadata: { id: uuidv4() },
  segments,
  filePath: undefined
}

const outputPath = path.join(process.cwd(), 'test_data', '100-cues.captions.json')
fs.writeFileSync(outputPath, JSON.stringify(doc, null, 2) + '\n', 'utf-8')

console.log(`Generated captions JSON with 100 segments: ${outputPath}`)
console.log(`Total segments: ${segments.length}`)
console.log(`Duration: 0:00 to 1:40`)
