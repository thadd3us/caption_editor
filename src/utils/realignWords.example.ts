/**
 * Example usage of realignWords utility
 *
 * This demonstrates how to preserve word-level timestamps when users edit transcript text.
 */

import { realignWords } from './realignWords'
import type { TranscriptWord } from '../types/schema'

// Example 1: User adds a word in the middle
function exampleAddWord() {
  const originalWords: TranscriptWord[] = [
    { text: 'Hello', startTime: 1.0, endTime: 1.2 },
    { text: 'world', startTime: 1.3, endTime: 1.5 }
  ]

  const editedText = 'Hello beautiful world'

  const result = realignWords(originalWords, editedText)

  console.log('Example 1: Add word in middle')
  console.log('Original:', originalWords.map(w => w.text).join(' '))
  console.log('Edited:', editedText)
  console.log('Result:', result)
  console.log('  - "Hello" kept timestamp: 1.0-1.2')
  console.log('  - "beautiful" has no timestamp (new word)')
  console.log('  - "world" kept timestamp: 1.3-1.5')
  console.log()
}

// Example 2: User deletes a word
function exampleDeleteWord() {
  const originalWords: TranscriptWord[] = [
    { text: 'Hello', startTime: 1.0, endTime: 1.2 },
    { text: 'beautiful', startTime: 1.25, endTime: 1.3 },
    { text: 'world', startTime: 1.35, endTime: 1.5 }
  ]

  const editedText = 'Hello world'

  const result = realignWords(originalWords, editedText)

  console.log('Example 2: Delete word')
  console.log('Original:', originalWords.map(w => w.text).join(' '))
  console.log('Edited:', editedText)
  console.log('Result:', result)
  console.log('  - "Hello" kept timestamp: 1.0-1.2')
  console.log('  - "beautiful" was removed')
  console.log('  - "world" kept timestamp: 1.35-1.5')
  console.log()
}

// Example 3: User fixes a typo
function exampleFixTypo() {
  const originalWords: TranscriptWord[] = [
    { text: 'I', startTime: 0.0, endTime: 0.1 },
    { text: 'want', startTime: 0.15, endTime: 0.3 },
    { text: 'too', startTime: 0.35, endTime: 0.5 }, // typo!
    { text: 'go', startTime: 0.55, endTime: 0.7 }
  ]

  const editedText = 'I want to go'

  const result = realignWords(originalWords, editedText)

  console.log('Example 3: Fix typo "too" -> "to"')
  console.log('Original:', originalWords.map(w => w.text).join(' '))
  console.log('Edited:', editedText)
  console.log('Result:', result)
  console.log('  - "I" kept timestamp: 0.0-0.1')
  console.log('  - "want" kept timestamp: 0.15-0.3')
  console.log('  - "to" has timestamp from "too": 0.35-0.5 (LCS matched it)')
  console.log('  - "go" lost timestamp (algorithm chose different alignment)')
  console.log()
}

// Example 4: User changes capitalization only
function exampleCapitalization() {
  const originalWords: TranscriptWord[] = [
    { text: 'hello', startTime: 1.0, endTime: 1.2 },
    { text: 'world', startTime: 1.3, endTime: 1.5 }
  ]

  const editedText = 'Hello World'

  const result = realignWords(originalWords, editedText)

  console.log('Example 4: Change capitalization')
  console.log('Original:', originalWords.map(w => w.text).join(' '))
  console.log('Edited:', editedText)
  console.log('Result:', result)
  console.log('  - "Hello" kept timestamp: 1.0-1.2 (case-insensitive match)')
  console.log('  - "World" kept timestamp: 1.3-1.5 (case-insensitive match)')
  console.log()
}

// Run examples
if (require.main === module) {
  exampleAddWord()
  exampleDeleteWord()
  exampleFixTypo()
  exampleCapitalization()
}
