/**
 * Stable JSON utilities.
 *
 * We preserve field declaration order (matching the schema) with 2-space
 * indentation so that:
 * - Node/Electron writers produce consistent, readable output
 * - Python tools can match formatting via json.dumps(indent=2)
 */

/**
 * Strip undefined values deeply so JSON.stringify produces clean output.
 */
export function stripUndefinedDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUndefinedDeep)
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(obj)) {
      const v = obj[key]
      if (v !== undefined) {
        out[key] = stripUndefinedDeep(v)
      }
    }
    return out
  }

  return value
}

export function stableJsonStringify(value: unknown, indentSpaces = 2): string {
  const cleaned = stripUndefinedDeep(value)
  return JSON.stringify(cleaned, null, indentSpaces) + '\n'
}

