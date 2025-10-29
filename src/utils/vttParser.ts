import { v4 as uuidv4 } from 'uuid'
import type { VTTCue, VTTDocument, VTTCueMetadata, ParseResult, SegmentHistory, SegmentHistoryEntry } from '../types/vtt'

/**
 * Get current timestamp in ISO 8601 format with local timezone
 */
export function getCurrentTimestamp(): string {
  const now = new Date()
  const offset = -now.getTimezoneOffset()
  const offsetHours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0')
  const offsetMinutes = (Math.abs(offset) % 60).toString().padStart(2, '0')
  const offsetSign = offset >= 0 ? '+' : '-'

  const year = now.getFullYear()
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const day = now.getDate().toString().padStart(2, '0')
  const hours = now.getHours().toString().padStart(2, '0')
  const minutes = now.getMinutes().toString().padStart(2, '0')
  const seconds = now.getSeconds().toString().padStart(2, '0')
  const milliseconds = now.getMilliseconds().toString().padStart(3, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${offsetSign}${offsetHours}:${offsetMinutes}`
}

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
    let segmentHistory: SegmentHistory | undefined = undefined

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
          const parsed = JSON.parse(noteContent)

          // Check if it's segment history (has 'entries' array)
          if (Array.isArray(parsed.entries)) {
            segmentHistory = parsed as SegmentHistory
            console.log('Found segment history with', segmentHistory.entries.length, 'entries')
          }
          // Otherwise check if it's cue metadata (has 'id' field)
          else if (parsed.id) {
            pendingMetadata = parsed as VTTCueMetadata
            console.log('Found metadata for cue:', pendingMetadata.id)
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
          const timestamp = pendingMetadata?.timestamp

          cues.push({
            id,
            startTime,
            endTime,
            text: text.trim(),
            rating,
            timestamp
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
              const timestamp = pendingMetadata?.timestamp

              cues.push({
                id,
                startTime,
                endTime,
                text: text.trim(),
                rating,
                timestamp
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
        cues: Object.freeze(cues),
        history: segmentHistory
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
    // Always add NOTE with metadata
    const metadata: VTTCueMetadata = {
      id: cue.id,
      rating: cue.rating,
      timestamp: cue.timestamp
    }
    output += `NOTE ${JSON.stringify(metadata)}\n\n`

    // Add cue identifier (UUID)
    output += `${cue.id}\n`

    // Add timing
    output += `${formatTimestamp(cue.startTime)} --> ${formatTimestamp(cue.endTime)}\n`

    // Add text
    output += `${cue.text}\n\n`
  }

  // Add segment history at the end if it exists
  if (document.history && document.history.entries.length > 0) {
    output += `NOTE ${JSON.stringify(document.history)}\n`
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
 * Sort cues by start time, then end time
 */
function sortCues(cues: readonly VTTCue[]): readonly VTTCue[] {
  const sorted = [...cues].sort((a, b) => {
    if (a.startTime !== b.startTime) {
      return a.startTime - b.startTime
    }
    return a.endTime - b.endTime
  })
  return Object.freeze(sorted)
}

/**
 * Find the index of the cue that should be selected for a given time.
 * Returns the index of the cue that contains the time, or the last cue before it.
 * Returns -1 if there are no cues or if time is before all cues.
 *
 * @param cues - Array of cues (must be sorted by start time)
 * @param time - The time to search for
 * @returns The index of the matching cue, or -1 if no match
 */
export function findIndexOfRowForTime(cues: readonly VTTCue[], time: number): number {
  if (cues.length === 0) {
    return -1
  }

  // Find the cue that contains the current time
  const indexAtTime = cues.findIndex(cue =>
    cue.startTime <= time && time < cue.endTime
  )

  if (indexAtTime !== -1) {
    return indexAtTime
  }

  // If no cue contains the time, find the last cue before it
  let lastIndexBefore = -1
  for (let i = cues.length - 1; i >= 0; i--) {
    if (cues[i].startTime <= time) {
      lastIndexBefore = i
      break
    }
  }

  return lastIndexBefore
}

/**
 * Add a history entry to the document
 */
function addHistoryEntry(document: VTTDocument, cue: VTTCue, action: 'modified' | 'deleted'): VTTDocument {
  const newEntry: SegmentHistoryEntry = {
    action,
    actionTimestamp: getCurrentTimestamp(),
    cue // Preserve the original cue state including its original timestamp
  }

  const existingEntries = document.history?.entries || []
  const newHistory: SegmentHistory = {
    entries: Object.freeze([...existingEntries, newEntry])
  }

  return {
    ...document,
    history: newHistory
  }
}

/**
 * Add a new cue to the document (returns new document with sorted cues)
 */
export function addCue(document: VTTDocument, cue: VTTCue): VTTDocument {
  console.log('Adding cue:', cue.id)
  return {
    ...document,
    cues: sortCues([...document.cues, cue])
  }
}

/**
 * Update an existing cue (returns new document with sorted cues)
 * Records the previous state in history and sets timestamp on updated cue
 */
export function updateCue(document: VTTDocument, cueId: string, updates: Partial<Omit<VTTCue, 'id'>>): VTTDocument {
  console.log('Updating cue:', cueId, updates)

  // Find the original cue to save to history
  const originalCue = document.cues.find(cue => cue.id === cueId)
  if (!originalCue) {
    console.warn('Cue not found:', cueId)
    return document
  }

  // Update the cues with new timestamp
  const currentTimestamp = getCurrentTimestamp()
  const updatedCues = document.cues.map(cue =>
    cue.id === cueId
      ? { ...cue, ...updates, timestamp: currentTimestamp }
      : cue
  )

  // Create document with updated cues
  let newDocument: VTTDocument = {
    ...document,
    cues: sortCues(updatedCues)
  }

  // Add history entry (with the original cue before modification)
  newDocument = addHistoryEntry(newDocument, originalCue, 'modified')

  return newDocument
}

/**
 * Delete a cue (returns new document)
 * Records the deleted cue in history
 */
export function deleteCue(document: VTTDocument, cueId: string): VTTDocument {
  console.log('Deleting cue:', cueId)

  // Find the cue to save to history before deleting
  const deletedCue = document.cues.find(cue => cue.id === cueId)
  if (!deletedCue) {
    console.warn('Cue not found:', cueId)
    return document
  }

  // Create document with cue removed
  let newDocument: VTTDocument = {
    ...document,
    cues: Object.freeze(document.cues.filter(cue => cue.id !== cueId))
  }

  // Add history entry
  newDocument = addHistoryEntry(newDocument, deletedCue, 'deleted')

  return newDocument
}
