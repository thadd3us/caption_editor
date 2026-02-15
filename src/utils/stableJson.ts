/**
 * Stable JSON utilities.
 *
 * We use a stable key ordering + 2-space indentation so that:
 * - Node/Electron writers produce consistent diffs
 * - Python tools can match formatting via json.dumps(sort_keys=True, indent=2)
 */
export function stableSortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableSortKeysDeep)
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) {
      const v = obj[key]
      // JSON.stringify drops undefined values, but we avoid copying them anyway.
      if (v !== undefined) {
        out[key] = stableSortKeysDeep(v)
      }
    }
    return out
  }

  return value
}

export function stableJsonStringify(value: unknown, indentSpaces = 2): string {
  const sorted = stableSortKeysDeep(value)
  return JSON.stringify(sorted, null, indentSpaces) + '\n'
}

