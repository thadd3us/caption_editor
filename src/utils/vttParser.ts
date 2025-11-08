import { v4 as uuidv4 } from 'uuid'
import type { VTTCue, VTTDocument, ParseResult, SegmentHistoryEntry, TranscriptMetadata } from '../types/schema'

/**
 * Sentinel prefix for app-specific NOTE comments in VTT files
 * Format: NOTE CAPTION_EDITOR:TypeName {json}
 */
const CAPTION_EDITOR_SENTINEL = 'CAPTION_EDITOR'

/**
 * Get current timestamp in ISO 8601 format with local timezone
 */
export function getCurrentTimestamp(): string {
  const now = new Date()
  const offset = -now.getTimezoneOffset()
  const offsetHours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')
  const offsetMinutes = String(Math.abs(offset) % 60).padStart(2, '0')
  const offsetSign = offset >= 0 ? '+' : '-'

  // Get ISO string without the 'Z' and append timezone offset
  return now.toISOString().slice(0, -1) + offsetSign + offsetHours + ':' + offsetMinutes
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
 * Complete a pending cue by adding timing and text.
 * If no pending cue exists, creates a new one with generated ID.
 */
function completeCue(
  pendingCue: Partial<VTTCue> | null,
  id: string,
  startTime: number,
  endTime: number,
  text: string
): VTTCue {
  // Start with pending metadata or empty object
  const cue = pendingCue || {}

  // Fill in the parsed fields
  return {
    id: cue.id || id,
    startTime,
    endTime,
    text: text.trim(),
    speakerName: cue.speakerName,
    rating: cue.rating,
    timestamp: cue.timestamp
  }
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
    let pendingCue: VTTCue | null = null
    const historyEntries: SegmentHistoryEntry[] = []
    let transcriptMetadata: TranscriptMetadata | undefined = undefined

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

        // Check if this is a CAPTION_EDITOR sentinel note
        if (noteContent.startsWith(`${CAPTION_EDITOR_SENTINEL}:`)) {
          const sentinelMatch = noteContent.match(new RegExp(`^${CAPTION_EDITOR_SENTINEL}:(\\w+)\\s+(.+)$`))
          if (sentinelMatch) {
            const typeName = sentinelMatch[1]
            const jsonContent = sentinelMatch[2]

            try {
              const parsed = JSON.parse(jsonContent)

              if (typeName === 'TranscriptMetadata' && !transcriptMetadata) {
                transcriptMetadata = parsed as TranscriptMetadata
                console.log('Found transcript metadata:', transcriptMetadata.id)
              } else if (typeName === 'VTTCue') {
                pendingCue = parsed as VTTCue
                console.log('Found cue:', pendingCue.id)
              } else if (typeName === 'SegmentHistoryEntry') {
                const entry = parsed as SegmentHistoryEntry
                historyEntries.push(entry)
                console.log('Found history entry:', entry.id, entry.action)
              } else {
                console.log(`Unknown ${CAPTION_EDITOR_SENTINEL} type:`, typeName)
              }
            } catch (err) {
              console.warn(`Failed to parse ${CAPTION_EDITOR_SENTINEL} metadata:`, err)
            }
          }
        } else {
          // Regular NOTE comment without CAPTION_EDITOR sentinel - ignore
          console.log(`NOTE is regular comment (not ${CAPTION_EDITOR_SENTINEL} metadata), ignoring`)
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

          // Complete the cue with timing and text
          const cue = completeCue(pendingCue, uuidv4(), startTime, endTime, text)
          cues.push(cue)

          console.log(`Parsed cue: ${cue.id}, ${startStr} --> ${endStr}`)
          pendingCue = null

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
                : uuidv4()
              const cue = completeCue(pendingCue, id, startTime, endTime, text)
              cues.push(cue)

              console.log(`Parsed cue with identifier: ${cue.id}, ${startStr} --> ${endStr}`)
              pendingCue = null

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
        metadata: transcriptMetadata || { id: uuidv4() },
        cues: Object.freeze(cues),
        history: historyEntries.length > 0 ? Object.freeze(historyEntries) : undefined
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
 * Uses CAPTION_EDITOR sentinel format for metadata
 */
export function serializeVTT(document: VTTDocument): string {
  console.log('Serializing VTT document with', document.cues.length, 'cues')

  let output = 'WEBVTT\n\n'

  // Add TranscriptMetadata at the top with sentinel
  output += `NOTE ${CAPTION_EDITOR_SENTINEL}:TranscriptMetadata ${JSON.stringify(document.metadata)}\n\n`

  // Sort cues by start time, then by end time
  const sortedCues = [...document.cues].sort((a, b) => {
    if (a.startTime !== b.startTime) {
      return a.startTime - b.startTime
    }
    return a.endTime - b.endTime
  })

  for (const cue of sortedCues) {
    // Always add NOTE with entire cue using sentinel format
    output += `NOTE ${CAPTION_EDITOR_SENTINEL}:VTTCue ${JSON.stringify(cue)}\n\n`

    // Add cue identifier (UUID)
    output += `${cue.id}\n`

    // Add timing
    output += `${formatTimestamp(cue.startTime)} --> ${formatTimestamp(cue.endTime)}\n`

    // Add text
    output += `${cue.text}\n\n`
  }

  // Add history entries at the end if they exist (one NOTE per entry)
  if (document.history && document.history.length > 0) {
    for (const entry of document.history) {
      output += `NOTE ${CAPTION_EDITOR_SENTINEL}:SegmentHistoryEntry ${JSON.stringify(entry)}\n`
    }
  }

  return output
}

/**
 * Create a new empty VTT document
 */
export function createEmptyDocument(): VTTDocument {
  return {
    metadata: { id: uuidv4() },
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
function addHistoryEntry(document: VTTDocument, cue: VTTCue, action: 'modified' | 'deleted' | 'renameSpeaker'): VTTDocument {
  const newEntry: SegmentHistoryEntry = {
    id: uuidv4(),
    action,
    actionTimestamp: getCurrentTimestamp(),
    cue // Preserve the original cue state including its original timestamp
  }

  const existingEntries = document.history || []
  const newHistory = Object.freeze([...existingEntries, newEntry])

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

/**
 * Rename all occurrences of a speaker name (returns new document)
 * Records all modified cues in history
 */
export function renameSpeaker(document: VTTDocument, oldName: string, newName: string): VTTDocument {
  console.log('Renaming speaker:', oldName, '->', newName)

  const currentTimestamp = getCurrentTimestamp()
  let newDocument = document

  // Find all cues with the old speaker name and update them
  for (const cue of document.cues) {
    if (cue.speakerName === oldName) {
      // Add history entry for this cue before modification
      newDocument = addHistoryEntry(newDocument, cue, 'renameSpeaker')
    }
  }

  // Update all cues with the new speaker name
  const updatedCues = newDocument.cues.map(cue =>
    cue.speakerName === oldName
      ? { ...cue, speakerName: newName, timestamp: currentTimestamp }
      : cue
  )

  return {
    ...newDocument,
    cues: Object.freeze(updatedCues)
  }
}
