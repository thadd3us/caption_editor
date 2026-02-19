/**
 * Encode/decode speaker embedding vectors as base64 little-endian float32.
 *
 * This format is shared with Python (transcribe/schema.py) — both sides use
 * the same encoding so .captions_json files are portable.
 */

/**
 * Decode a base64-encoded little-endian float32 vector into a Float32Array.
 */
export function decodeEmbedding(b64: string): Float32Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Float32Array(bytes.buffer)
}

/**
 * Encode a numeric array as a base64 little-endian float32 string.
 */
export function encodeEmbedding(values: ArrayLike<number>): string {
  const floats = new Float32Array(values.length)
  for (let i = 0; i < values.length; i++) {
    floats[i] = values[i]
  }
  const bytes = new Uint8Array(floats.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}
