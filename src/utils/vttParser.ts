import { v4 as uuidv4 } from 'uuid'
import type { VTTCue, VTTDocument, VTTCueMetadata, ParseResult } from '../types/vtt'

/**
 * Parse timestamp in format HH:MM:SS.mmm or MM:SS.mmm to seconds
 */
function parseTimestamp(timestamp: string): number {
  console.log('Parsing timestamp:', timestamp)
  const parts = timestamp.split(':')
  let seconds = 0

  if (parts.length === 3) {
    // HH:MM:SS.mmm
    seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2])
  } else if (parts.length === 2) {
    // MM:SS.mmm
    seconds = parseInt(parts[0]) * 60 + parseFloat(parts[1])
  } else {
    throw new Error(`Invalid timestamp format: ${timestamp}`)
  }

  return seconds
}

/**
 * Format seconds to VTT timestamp HH:MM:SS.mmm
 */
export function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  const h = hours.toString().padStart(2, '0')
  const m = minutes.toString().padStart(2, '0')
  const s = secs.toFixed(3).padStart(6, '0')

  return `${h}:${m}:${s}`
}

/**
 * Validate timestamp format and range
 */
export function validateTimestamp(timestamp: string): boolean {
  try {
    const seconds = parseTimestamp(timestamp)
    return seconds >= 0
  } catch {
    return false
  }
}

/**
 * Parse VTT file content into a VTTDocument
 * Supports cue identifiers (UUIDs) and NOTE comments with metadata
 */
export function parseVTT(content: string): ParseResult {
  console.log('Parsing VTT content, length:', content.length)

  try {
    const lines = content.split(/\r?\n/)

    // Check for WEBVTT header
    if (!lines[0]?.trim().startsWith('WEBVTT')) {
      return {
        success: false,
        error: 'Invalid VTT file: missing WEBVTT header'
      }
    }

    const cues: VTTCue[] = []
    let i = 1
    let pendingMetadata: VTTCueMetadata | null = null

    while (i < lines.length) {
      const line = lines[i].trim()

      // Skip empty lines
      if (!line) {
        i++
        continue
      }

      // Check for NOTE comment with metadata
      if (line.startsWith('NOTE')) {
        // Extract content after "NOTE " on the same line
        let noteContent = line.substring(4).trim()

        // If no content on same line, read next lines until blank line
        if (!noteContent) {
          i++
          while (i < lines.length && lines[i].trim()) {
            noteContent += lines[i].trim()
            i++
          }
        } else {
          i++
        }

        // Try to parse as JSON metadata
        try {
          const metadata = JSON.parse(noteContent) as VTTCueMetadata
          if (metadata.id) {
            pendingMetadata = metadata
            console.log('Found metadata for cue:', metadata.id)
          }
        } catch {
          // Not JSON metadata, ignore
          console.log('NOTE is not metadata JSON, ignoring')
        }
        continue
      }

      // Check if this line is a cue identifier or timing line
      const timingMatch = line.match(/^(.*?)-->(.*)$/)

      if (timingMatch) {
        // This is a timing line without identifier
        const startStr = timingMatch[1].trim()
        const endStr = timingMatch[2].trim()

        try {
          const startTime = parseTimestamp(startStr)
          const endTime = parseTimestamp(endStr)

          if (endTime <= startTime) {
            console.warn(`Invalid cue: end time <= start time (${startStr} --> ${endStr})`)
            i++
            continue
          }

          // Read cue text (until blank line)
          i++
          let text = ''
          while (i < lines.length && lines[i].trim()) {
            if (text) text += '\n'
            text += lines[i]
            i++
          }

          // Generate or use metadata ID
          const id = pendingMetadata?.id || uuidv4()
          const rating = pendingMetadata?.rating

          cues.push({
            id,
            startTime,
            endTime,
            text: text.trim(),
            rating
          })

          console.log(`Parsed cue: ${id}, ${startStr} --> ${endStr}`)
          pendingMetadata = null

        } catch (err) {
          console.warn('Failed to parse cue timing:', err)
          i++
        }
      } else {
        // This might be a cue identifier
        const identifier = line
        i++

        // Next line should be timing
        if (i < lines.length) {
          const timingLine = lines[i].trim()
          const timingMatch2 = timingLine.match(/^(.*?)-->(.*)$/)

          if (timingMatch2) {
            const startStr = timingMatch2[1].trim()
            const endStr = timingMatch2[2].trim()

            try {
              const startTime = parseTimestamp(startStr)
              const endTime = parseTimestamp(endStr)

              if (endTime <= startTime) {
                console.warn(`Invalid cue: end time <= start time (${startStr} --> ${endStr})`)
                i++
                continue
              }

              // Read cue text
              i++
              let text = ''
              while (i < lines.length && lines[i].trim()) {
                if (text) text += '\n'
                text += lines[i]
                i++
              }

              // Use identifier as ID if it looks like a UUID, otherwise generate
              const id = identifier.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
                ? identifier
                : (pendingMetadata?.id || uuidv4())
              const rating = pendingMetadata?.rating

              cues.push({
                id,
                startTime,
                endTime,
                text: text.trim(),
                rating
              })

              console.log(`Parsed cue with identifier: ${id}, ${startStr} --> ${endStr}`)
              pendingMetadata = null

            } catch (err) {
              console.warn('Failed to parse cue timing:', err)
              i++
            }
          } else {
            // Not a timing line, skip
            i++
          }
        }
      }
    }

    console.log(`Parsed ${cues.length} cues`)

    return {
      success: true,
      document: {
        cues: Object.freeze(cues)
      }
    }

  } catch (err) {
    console.error('VTT parsing error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown parsing error'
    }
  }
}

/**
 * Serialize VTTDocument to VTT file content
 * Includes NOTE comments for metadata (UUID and rating)
 */
export function serializeVTT(document: VTTDocument): string {
  console.log('Serializing VTT document with', document.cues.length, 'cues')

  let output = 'WEBVTT\n\n'

  // Sort cues by start time, then by end time
  const sortedCues = [...document.cues].sort((a, b) => {
    if (a.startTime !== b.startTime) {
      return a.startTime - b.startTime
    }
    return a.endTime - b.endTime
  })

  for (const cue of sortedCues) {
    // Add NOTE with metadata if rating exists
    if (cue.rating !== undefined) {
      const metadata: VTTCueMetadata = {
        id: cue.id,
        rating: cue.rating
      }
      output += `NOTE ${JSON.stringify(metadata)}\n\n`
    }

    // Add cue identifier (UUID)
    output += `${cue.id}\n`

    // Add timing
    output += `${formatTimestamp(cue.startTime)} --> ${formatTimestamp(cue.endTime)}\n`

    // Add text
    output += `${cue.text}\n\n`
  }

  return output
}

/**
 * Create a new empty VTT document
 */
export function createEmptyDocument(): VTTDocument {
  return {
    cues: Object.freeze([])
  }
}

/**
 * Add a new cue to the document (returns new document)
 */
export function addCue(document: VTTDocument, cue: VTTCue): VTTDocument {
  console.log('Adding cue:', cue.id)
  return {
    ...document,
    cues: Object.freeze([...document.cues, cue])
  }
}

/**
 * Update an existing cue (returns new document)
 */
export function updateCue(document: VTTDocument, cueId: string, updates: Partial<Omit<VTTCue, 'id'>>): VTTDocument {
  console.log('Updating cue:', cueId, updates)
  return {
    ...document,
    cues: Object.freeze(
      document.cues.map(cue =>
        cue.id === cueId
          ? { ...cue, ...updates }
          : cue
      )
    )
  }
}

/**
 * Delete a cue (returns new document)
 */
export function deleteCue(document: VTTDocument, cueId: string): VTTDocument {
  console.log('Deleting cue:', cueId)
  return {
    ...document,
    cues: Object.freeze(document.cues.filter(cue => cue.id !== cueId))
  }
}
