import { describe, it, expect } from 'vitest'
import { realignWords } from './realignWords'
import type { TranscriptWord } from '../types/schema'

describe('realignWords', () => {
  describe('edge cases', () => {
    it('should return empty array for empty input', () => {
      const result = realignWords([], '')
      expect(result).toEqual([])
    })

    it('should return empty array for whitespace-only edited text', () => {
      const original: TranscriptWord[] = [
        { text: 'Hello', startTime: 1.0, endTime: 1.2 }
      ]
      const result = realignWords(original, '   ')
      expect(result).toEqual([])
    })

    it('should handle no original words with new text', () => {
      const result = realignWords([], 'new text here')
      expect(result).toEqual([
        { text: 'new' },
        { text: 'text' },
        { text: 'here' }
      ])
    })

    it('should handle single word', () => {
      const original: TranscriptWord[] = [
        { text: 'Hello', startTime: 1.0, endTime: 1.2 }
      ]
      const result = realignWords(original, 'Hello')
      expect(result).toEqual([
        { text: 'Hello', startTime: 1.0, endTime: 1.2 }
      ])
    })
  })

  describe('no changes', () => {
    it('should preserve all timestamps when text is unchanged', () => {
      const original: TranscriptWord[] = [
        { text: 'Hello', startTime: 1.0, endTime: 1.2 },
        { text: 'world', startTime: 1.3, endTime: 1.5 }
      ]
      const result = realignWords(original, 'Hello world')
      expect(result).toEqual(original)
    })

    it('should handle extra whitespace in edited text', () => {
      const original: TranscriptWord[] = [
        { text: 'Hello', startTime: 1.0, endTime: 1.2 },
        { text: 'world', startTime: 1.3, endTime: 1.5 }
      ]
      const result = realignWords(original, '  Hello   world  ')
      expect(result).toEqual(original)
    })
  })

  describe('word insertion', () => {
    it('should add new word at the beginning', () => {
      const original: TranscriptWord[] = [
        { text: 'world', startTime: 1.3, endTime: 1.5 }
      ]
      const result = realignWords(original, 'Hello world')
      expect(result).toEqual([
        { text: 'Hello' }, // new word, no timestamp
        { text: 'world', startTime: 1.3, endTime: 1.5 }
      ])
    })

    it('should add new word in the middle', () => {
      const original: TranscriptWord[] = [
        { text: 'Hello', startTime: 1.0, endTime: 1.2 },
        { text: 'world', startTime: 1.3, endTime: 1.5 }
      ]
      const result = realignWords(original, 'Hello beautiful world')
      expect(result).toEqual([
        { text: 'Hello', startTime: 1.0, endTime: 1.2 },
        { text: 'beautiful' }, // new word, no timestamp
        { text: 'world', startTime: 1.3, endTime: 1.5 }
      ])
    })

    it('should add new word at the end', () => {
      const original: TranscriptWord[] = [
        { text: 'Hello', startTime: 1.0, endTime: 1.2 }
      ]
      const result = realignWords(original, 'Hello world')
      expect(result).toEqual([
        { text: 'Hello', startTime: 1.0, endTime: 1.2 },
        { text: 'world' } // new word, no timestamp
      ])
    })

    it('should add multiple new words', () => {
      const original: TranscriptWord[] = [
        { text: 'Hello', startTime: 1.0, endTime: 1.2 },
        { text: 'world', startTime: 1.3, endTime: 1.5 }
      ]
      const result = realignWords(original, 'Hello beautiful amazing world today')
      expect(result).toEqual([
        { text: 'Hello', startTime: 1.0, endTime: 1.2 },
        { text: 'beautiful' },
        { text: 'amazing' },
        { text: 'world', startTime: 1.3, endTime: 1.5 },
        { text: 'today' }
      ])
    })
  })

  describe('word deletion', () => {
    it('should remove word from the beginning', () => {
      const original: TranscriptWord[] = [
        { text: 'Hello', startTime: 1.0, endTime: 1.2 },
        { text: 'world', startTime: 1.3, endTime: 1.5 }
      ]
      const result = realignWords(original, 'world')
      expect(result).toEqual([
        { text: 'world', startTime: 1.3, endTime: 1.5 }
      ])
    })

    it('should remove word from the middle', () => {
      const original: TranscriptWord[] = [
        { text: 'Hello', startTime: 1.0, endTime: 1.2 },
        { text: 'beautiful', startTime: 1.25, endTime: 1.3 },
        { text: 'world', startTime: 1.35, endTime: 1.5 }
      ]
      const result = realignWords(original, 'Hello world')
      expect(result).toEqual([
        { text: 'Hello', startTime: 1.0, endTime: 1.2 },
        { text: 'world', startTime: 1.35, endTime: 1.5 }
      ])
    })

    it('should remove word from the end', () => {
      const original: TranscriptWord[] = [
        { text: 'Hello', startTime: 1.0, endTime: 1.2 },
        { text: 'world', startTime: 1.3, endTime: 1.5 }
      ]
      const result = realignWords(original, 'Hello')
      expect(result).toEqual([
        { text: 'Hello', startTime: 1.0, endTime: 1.2 }
      ])
    })

    it('should remove multiple words', () => {
      const original: TranscriptWord[] = [
        { text: 'Hello', startTime: 1.0, endTime: 1.2 },
        { text: 'beautiful', startTime: 1.25, endTime: 1.3 },
        { text: 'amazing', startTime: 1.35, endTime: 1.4 },
        { text: 'world', startTime: 1.45, endTime: 1.5 }
      ]
      const result = realignWords(original, 'Hello world')
      expect(result).toEqual([
        { text: 'Hello', startTime: 1.0, endTime: 1.2 },
        { text: 'world', startTime: 1.45, endTime: 1.5 }
      ])
    })

    it('should remove all words', () => {
      const original: TranscriptWord[] = [
        { text: 'Hello', startTime: 1.0, endTime: 1.2 },
        { text: 'world', startTime: 1.3, endTime: 1.5 }
      ]
      const result = realignWords(original, '')
      expect(result).toEqual([])
    })
  })

  describe('word replacement', () => {
    it('should replace single word', () => {
      const original: TranscriptWord[] = [
        { text: 'Hello', startTime: 1.0, endTime: 1.2 },
        { text: 'world', startTime: 1.3, endTime: 1.5 }
      ]
      const result = realignWords(original, 'Hello universe')
      expect(result).toEqual([
        { text: 'Hello', startTime: 1.0, endTime: 1.2 },
        { text: 'universe' } // replacement, no timestamp
      ])
    })

    it('should replace multiple words', () => {
      const original: TranscriptWord[] = [
        { text: 'Hello', startTime: 1.0, endTime: 1.2 },
        { text: 'world', startTime: 1.3, endTime: 1.5 }
      ]
      const result = realignWords(original, 'Goodbye everyone')
      expect(result).toEqual([
        { text: 'Goodbye' },
        { text: 'everyone' }
      ])
    })

    it('should handle replacement with different word count', () => {
      const original: TranscriptWord[] = [
        { text: 'Hello', startTime: 1.0, endTime: 1.2 },
        { text: 'world', startTime: 1.3, endTime: 1.5 }
      ]
      const result = realignWords(original, 'Greetings')
      expect(result).toEqual([
        { text: 'Greetings' }
      ])
    })
  })

  describe('mixed operations', () => {
    it('should handle insertion, deletion, and preservation', () => {
      const original: TranscriptWord[] = [
        { text: 'Hello', startTime: 1.0, endTime: 1.2 },
        { text: 'beautiful', startTime: 1.25, endTime: 1.3 },
        { text: 'world', startTime: 1.35, endTime: 1.5 },
        { text: 'today', startTime: 1.55, endTime: 1.7 }
      ]
      const result = realignWords(original, 'Hello amazing world')
      expect(result).toEqual([
        { text: 'Hello', startTime: 1.0, endTime: 1.2 },
        { text: 'amazing' }, // inserted
        { text: 'world', startTime: 1.35, endTime: 1.5 }
        // 'beautiful' deleted, 'today' deleted
      ])
    })

    it('should handle complex real-world edit', () => {
      const original: TranscriptWord[] = [
        { text: 'The', startTime: 0.0, endTime: 0.1 },
        { text: 'quick', startTime: 0.15, endTime: 0.3 },
        { text: 'brown', startTime: 0.35, endTime: 0.5 },
        { text: 'fox', startTime: 0.55, endTime: 0.7 }
      ]
      // Fix typo "quick" -> "quick", remove "brown", add "red"
      const result = realignWords(original, 'The quick red fox')
      expect(result).toEqual([
        { text: 'The', startTime: 0.0, endTime: 0.1 },
        { text: 'quick', startTime: 0.15, endTime: 0.3 },
        { text: 'red' }, // new word
        { text: 'fox', startTime: 0.55, endTime: 0.7 }
      ])
    })
  })

  describe('capitalization changes', () => {
    it('should preserve timestamps when only capitalization changes', () => {
      const original: TranscriptWord[] = [
        { text: 'hello', startTime: 1.0, endTime: 1.2 },
        { text: 'world', startTime: 1.3, endTime: 1.5 }
      ]
      const result = realignWords(original, 'Hello World')
      expect(result).toEqual([
        { text: 'Hello', startTime: 1.0, endTime: 1.2 },
        { text: 'World', startTime: 1.3, endTime: 1.5 }
      ])
    })

    it('should use edited word capitalization', () => {
      const original: TranscriptWord[] = [
        { text: 'HELLO', startTime: 1.0, endTime: 1.2 }
      ]
      const result = realignWords(original, 'hello')
      expect(result).toEqual([
        { text: 'hello', startTime: 1.0, endTime: 1.2 }
      ])
    })
  })

  describe('punctuation handling', () => {
    it('should treat punctuation-only changes as modifications', () => {
      const original: TranscriptWord[] = [
        { text: 'Hello', startTime: 1.0, endTime: 1.2 },
        { text: 'world', startTime: 1.3, endTime: 1.5 }
      ]
      // Note: "world!" is now a different word than "world"
      const result = realignWords(original, 'Hello world!')
      // The diff algorithm will see "world" deleted and "world!" added
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ text: 'Hello', startTime: 1.0, endTime: 1.2 })
      // "world!" is treated as a new word (different from "world")
    })
  })

  describe('words without timestamps', () => {
    it('should handle original words that have no timestamps', () => {
      const original: TranscriptWord[] = [
        { text: 'Hello' }, // no timestamp
        { text: 'world', startTime: 1.3, endTime: 1.5 }
      ]
      const result = realignWords(original, 'Hello world')
      expect(result).toEqual([
        { text: 'Hello', startTime: undefined, endTime: undefined },
        { text: 'world', startTime: 1.3, endTime: 1.5 }
      ])
    })

    it('should preserve lack of timestamps for matched words', () => {
      const original: TranscriptWord[] = [
        { text: 'Hello', startTime: 1.0, endTime: 1.2 },
        { text: 'beautiful' }, // no timestamp
        { text: 'world', startTime: 1.3, endTime: 1.5 }
      ]
      const result = realignWords(original, 'Hello beautiful world')
      expect(result).toEqual([
        { text: 'Hello', startTime: 1.0, endTime: 1.2 },
        { text: 'beautiful', startTime: undefined, endTime: undefined },
        { text: 'world', startTime: 1.3, endTime: 1.5 }
      ])
    })
  })

  describe('typo corrections', () => {
    it('should handle typo fix in middle of sentence', () => {
      const original: TranscriptWord[] = [
        { text: 'I', startTime: 0.0, endTime: 0.1 },
        { text: 'want', startTime: 0.15, endTime: 0.3 },
        { text: 'too', startTime: 0.35, endTime: 0.5 }, // typo
        { text: 'go', startTime: 0.55, endTime: 0.7 }
      ]
      const result = realignWords(original, 'I want to go')
      expect(result).toEqual([
        { text: 'I', startTime: 0.0, endTime: 0.1 },
        { text: 'want', startTime: 0.15, endTime: 0.3 },
        { text: 'to' }, // fixed typo, no timestamp
        { text: 'go', startTime: 0.55, endTime: 0.7 }
      ])
    })
  })

  describe('performance', () => {
    it('should handle long sequences efficiently', () => {
      // Create a long word sequence
      const original: TranscriptWord[] = []
      for (let i = 0; i < 1000; i++) {
        original.push({
          text: `word${i}`,
          startTime: i * 0.5,
          endTime: i * 0.5 + 0.4
        })
      }

      const editedText = original.map(w => w.text).join(' ')
      const start = performance.now()
      const result = realignWords(original, editedText)
      const duration = performance.now() - start

      expect(result).toHaveLength(1000)
      expect(duration).toBeLessThan(200) // Should complete in <200ms (LCS is O(m*n))
    })
  })
})
