import { v4 as uuidv4 } from 'uuid'
import { serializeVTT } from '../../src/utils/vttParser'
import type { VTTDocument } from '../../src/types/vtt'
import * as fs from 'fs'
import * as path from 'path'

// Generate 100 one-second cues numbered 0-99
const cues = []
for (let i = 0; i < 100; i++) {
  cues.push({
    id: uuidv4(),
    startTime: i,
    endTime: i + 1,
    text: `${i}`,
    rating: undefined
  })
}

const document: VTTDocument = {
  cues,
  filePath: undefined
}

const vttContent = serializeVTT(document)

const outputPath = path.join(process.cwd(), 'test_data', '100-cues.vtt')
fs.writeFileSync(outputPath, vttContent, 'utf-8')

console.log(`Generated VTT file with 100 cues: ${outputPath}`)
console.log(`Total cues: ${cues.length}`)
console.log(`Duration: 0:00 to 1:40`)
