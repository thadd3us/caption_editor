import JSON5 from 'json5'

/** Parse saved/exported `.captions_json5` (header comments + JSON5). */
export function parseCaptionsFileContent(content: string): unknown {
  return JSON5.parse(content)
}
