# Immutability: Code Examples - Current vs. Mutable Alternatives

## 1. PENDING PATTERN IN VTT PARSER

### Current Implementation (Immutable)

**File**: `/code/src/utils/vttParser.ts`, lines 92-257

```typescript
let pendingCue: VTTCue | null = null

// ... in parsing loop ...

// When NOTE metadata is found:
if (typeName === 'VTTCue') {
  pendingCue = parsed as VTTCue
  console.log('Found cue:', pendingCue.id)
}

// PATH 1: Timing without identifier (lines 183-199)
if (timingMatch) {
  // ... parse timing ...
  
  // Extract all properties from pending
  const id = pendingCue?.id || uuidv4()
  const rating = pendingCue?.rating
  const timestamp = pendingCue?.timestamp
  const speakerName = pendingCue?.speakerName

  // Push new cue
  cues.push({
    id,
    startTime,
    endTime,
    text: text.trim(),
    speakerName,
    rating,
    timestamp
  })

  // Reset pending
  pendingCue = null
}

// PATH 2: Timing with identifier (lines 241-257) - DUPLICATED CODE
if (timingMatch2) {
  // ... parse timing ...
  
  // Extract all properties from pending (AGAIN)
  const id = identifier.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    ? identifier
    : (pendingCue?.id || uuidv4())
  const rating = pendingCue?.rating
  const timestamp = pendingCue?.timestamp
  const speakerName = pendingCue?.speakerName

  // Push new cue (SAME CODE AS PATH 1)
  cues.push({
    id,
    startTime,
    endTime,
    text: text.trim(),
    speakerName,
    rating,
    timestamp
  })

  // Reset pending (DUPLICATE)
  pendingCue = null
}
```

**Issues**:
- Property extraction code appears twice (lines 184-186 and 242-244)
- Cue construction appears twice (lines 188-196 and 246-254)
- Null reset appears twice
- ~14 lines of duplication

---

### Improved Version (Keep Immutable - Recommended)

```typescript
// Helper function to eliminate duplication
function createCueFromPending(
  pendingCue: VTTCue | null,
  startTime: number,
  endTime: number,
  text: string,
  optionalId?: string
): VTTCue {
  return {
    id: optionalId || pendingCue?.id || uuidv4(),
    startTime,
    endTime,
    text,
    speakerName: pendingCue?.speakerName,
    rating: pendingCue?.rating,
    timestamp: pendingCue?.timestamp
  }
}

// In parsing loop - now used in both paths:

// PATH 1: Timing without identifier
if (timingMatch) {
  const startTime = parseTimestamp(startStr)
  const endTime = parseTimestamp(endStr)
  
  // Single line instead of 14 lines
  cues.push(createCueFromPending(pendingCue, startTime, endTime, text.trim()))
  pendingCue = null
}

// PATH 2: Timing with identifier
if (timingMatch2) {
  const startTime = parseTimestamp(startStr)
  const endTime = parseTimestamp(endStr)
  const id = identifier.match(UUID_REGEX) ? identifier : undefined
  
  // Single line, passes optional ID
  cues.push(createCueFromPending(pendingCue, startTime, endTime, text.trim(), id))
  pendingCue = null
}
```

**Benefits**:
- Eliminates duplication
- Still immutable (returns new VTTCue)
- Saves ~15 lines
- Clearer intent
- Easier to maintain

**Lines saved**: ~15 lines while keeping immutability

---

### Alternative: Mutable Version (Not Recommended)

If switching to mutable (not recommended):

```typescript
let currentCueMetadata: Partial<VTTCue> = {}

// When NOTE metadata found:
if (typeName === 'VTTCue') {
  currentCueMetadata = JSON.parse(jsonContent)
}

// When timing found (same code for both paths):
if (timingMatch || timingMatch2) {
  const cue: VTTCue = {
    id: currentCueMetadata.id || optionalIdentifier || uuidv4(),
    startTime,
    endTime,
    text: text.trim(),
    speakerName: currentCueMetadata.speakerName,
    rating: currentCueMetadata.rating,
    timestamp: currentCueMetadata.timestamp
  }
  cues.push(cue)
  currentCueMetadata = {} // Reset
}
```

**Trade-offs**:
- Saves ~8 lines vs immutable helper
- Loses compile-time immutability protection
- Must remember to reset metadata manually
- Not worth the risk

---

## 2. OBJECT SPREAD IN STORE (loadMediaFile)

### Current Implementation (Immutable)

**File**: `/code/src/stores/vttStore.ts`, lines 89-104

```typescript
function loadMediaFile(path: string, filePath?: string) {
  console.log('Loading media file:', path, 'with file path:', filePath)
  mediaPath.value = path

  // Store the ABSOLUTE file path in metadata
  if (filePath) {
    // Create new document by spreading
    document.value = {
      ...document.value,
      metadata: {
        ...document.value.metadata,
        mediaFilePath: filePath
      }
    }
  }
}
```

**Spreads**: 2 nested spreads (document and metadata)

---

### Alternative: Mutable Version

```typescript
function loadMediaFile(path: string, filePath?: string) {
  console.log('Loading media file:', path, 'with file path:', filePath)
  mediaPath.value = path

  if (filePath) {
    // Direct mutation
    document.value.metadata.mediaFilePath = filePath
    // PROBLEM: Vue may not detect this change without explicit reactivity
  }
}
```

**Issue**: Need to handle Vue reactivity:

```typescript
// Option A: Explicit Vue.set (if using Options API)
Vue.set(document.value.metadata, 'mediaFilePath', filePath)

// Option B: Create wrapper that signals Vue
function loadMediaFile(path: string, filePath?: string) {
  if (filePath) {
    document.value.metadata.mediaFilePath = filePath
    // Force Vue to see the change
    document.value = { ...document.value }
  }
}

// Option C: Use watch with deep:true
watch(
  () => document.value.metadata,
  () => { /* handle change */ },
  { deep: true }
)
```

---

### Immutable Version (Current - Recommended)

```typescript
function loadMediaFile(path: string, filePath?: string) {
  mediaPath.value = path
  
  if (filePath) {
    // Vue automatically sees the new object
    document.value = {
      ...document.value,
      metadata: {
        ...document.value.metadata,
        mediaFilePath: filePath
      }
    }
  }
}
```

**Why it's better**:
- Vue reactivity works automatically
- No need for special Vue.set() or deep watch
- Clear that state changed
- 5 lines vs 1 line, but much safer

---

## 3. DOCUMENT OPERATIONS IN UTILITIES

### Current: addCue (Immutable)

**File**: `/code/src/utils/vttParser.ts`, lines 416-422

```typescript
export function addCue(document: VTTDocument, cue: VTTCue): VTTDocument {
  console.log('Adding cue:', cue.id)
  return {
    ...document,           // Spread document
    cues: sortCues([...document.cues, cue])  // Spread cues array
  }
}
```

**Why two spreads**:
1. `...document` - preserve metadata, filePath, history
2. `[...document.cues, cue]` - create new array with new cue

---

### Alternative: Mutable Version

```typescript
export function addCue(document: VTTDocument, cue: VTTCue): void {
  document.cues.push(cue)
  sortCuesInPlace(document.cues)
  // PROBLEM: Grid doesn't know anything changed
}
```

**With Vue reactivity workaround**:

```typescript
export function addCue(document: VTTDocument, cue: VTTCue): void {
  document.cues.push(cue)
  sortCuesInPlace(document.cues)
  // Force Vue to detect change
  document.cues = [...document.cues]  // Still spreading!
}
```

**Result**: End up spreading anyway, defeating the purpose.

---

### Current: updateCue (Immutable)

**File**: `/code/src/utils/vttParser.ts`, lines 428-456

```typescript
export function updateCue(document: VTTDocument, cueId: string, updates: Partial<Omit<VTTCue, 'id'>>): VTTDocument {
  const originalCue = document.cues.find(cue => cue.id === cueId)
  if (!originalCue) return document

  // Spread to map over array
  const updatedCues = document.cues.map(cue =>
    cue.id === cueId
      ? { ...cue, ...updates, timestamp: getCurrentTimestamp() }  // Spread cue
      : cue
  )

  // Spread document with new cues
  let newDocument: VTTDocument = {
    ...document,
    cues: sortCues(updatedCues)
  }

  // Add history
  newDocument = addHistoryEntry(newDocument, originalCue, 'modified')

  return newDocument
}
```

**Spreads**: 3 spreads (cue, document, in addHistoryEntry)

---

### Alternative: Mutable Version

```typescript
export function updateCue(document: VTTDocument, cueId: string, updates: Partial<Omit<VTTCue, 'id'>>): void {
  const cue = document.cues.find(c => c.id === cueId)
  if (!cue) return

  // Record history BEFORE mutation
  addHistoryEntry(document, cue, 'modified')

  // Mutate in place
  Object.assign(cue, updates, { timestamp: getCurrentTimestamp() })
  
  // Re-sort
  sortCuesInPlace(document.cues)
  
  // PROBLEM: Need to signal Vue
  document.cues = [...document.cues]  // Spread anyway!
}
```

**Result**: Still need spreading for Vue reactivity.

---

## 4. OBJECT.FREEZE() USAGE

### Current Implementation

```typescript
// Line 277 - After parsing
return {
  success: true,
  document: {
    metadata: transcriptMetadata || { id: uuidv4() },
    cues: Object.freeze(cues),  // Prevent mutation
    history: historyEntries.length > 0 ? Object.freeze(historyEntries) : undefined
  }
}

// Line 341 - Empty document
export function createEmptyDocument(): VTTDocument {
  return {
    metadata: { id: uuidv4() },
    cues: Object.freeze([])  // Consistent immutability
  }
}

// Line 355 - Internal function
function sortCues(cues: readonly VTTCue[]): readonly VTTCue[] {
  const sorted = [...cues].sort((a, b) => ...)
  return Object.freeze(sorted)  // Could be removed (internal)
}

// Line 405 - History management
function addHistoryEntry(document: VTTDocument, cue: VTTCue, action: 'modified' | 'deleted'): VTTDocument {
  const newEntry: SegmentHistoryEntry = { ... }
  const existingEntries = document.history || []
  const newHistory = Object.freeze([...existingEntries, newEntry])  // Defensive
  return { ...document, history: newHistory }
}

// Line 475 - Deletion
export function deleteCue(document: VTTDocument, cueId: string): VTTDocument {
  const deletedCue = document.cues.find(cue => cue.id === cueId)
  if (!deletedCue) return document

  let newDocument: VTTDocument = {
    ...document,
    cues: Object.freeze(document.cues.filter(cue => cue.id !== cueId))  // Defensive
  }
  newDocument = addHistoryEntry(newDocument, deletedCue, 'deleted')
  return newDocument
}
```

### Optimized (Keep Immutable)

Could reduce to 4 freeze calls (removing from sortCues - internal function):

```typescript
// Line 277 - KEEP (public API)
cues: Object.freeze(cues)

// Line 278 - KEEP (public API)
history: historyEntries.length > 0 ? Object.freeze(historyEntries) : undefined

// Line 341 - KEEP (public API)
cues: Object.freeze([])

// Line 355 - REMOVE (internal)
return Object.freeze(sorted)  // Remove - internal function
// return sorted instead

// Line 405 - KEEP (public API)
const newHistory = Object.freeze([...existingEntries, newEntry])

// Line 475 - KEEP (public API)
cues: Object.freeze(document.cues.filter(...))
```

**Savings**: 1 freeze call removed (minimal impact)

---

## 5. AG GRID INTEGRATION

### Current Implementation (Immutable)

**File**: `/code/src/components/CaptionTable.vue`

```typescript
// Grid configuration
<ag-grid-vue
  :key="gridKey"                    // Force re-render on cue changes
  :rowData="rowData"
  :immutableData="true"             // Tell grid: data is immutable
  :getRowId="getRowId"              // Track rows by ID
/>

// Force re-render when cues array changes
const gridKey = computed(() => 
  store.document.cues.map(c => c.id).join(',')
)

// When a cue is updated:
store.updateCue(cueId, updates)
// Automatically re-renders because:
// 1. updateCue returns new document
// 2. gridKey computed prop changes
// 3. Vue re-renders CaptionTable
// 4. New rowData passed to grid
// 5. Grid detects changes via immutableData mode
```

**Flow diagram**:
```
updateCue(cueId, updates)
    ↓
Returns new VTTDocument
    ↓
document.value = newDocument
    ↓
gridKey computed prop changes
    ↓
CaptionTable component re-renders
    ↓
Grid receives new rowData
    ↓
Grid with immutableData=true compares by ID
    ↓
Only changed rows updated in DOM
```

---

### Alternative: Mutable Version

**Problem 1: Grid doesn't see changes**

```typescript
store.updateCue(cueId, updates)  // Mutates in place
// Grid still sees same cues array reference
// immutableData mode doesn't trigger updates
```

**Solution A: Manual refresh**

```typescript
store.updateCue(cueId, updates)
gridApi.value?.refreshCells()  // Explicit refresh

// Problems:
// - Easy to forget
// - Error-prone
// - Less efficient
```

**Solution B: Switch off immutableData**

```typescript
<ag-grid-vue
  :immutableData="false"  // Switch to mutable mode
  // Grid now watches for property changes
/>

// Problems:
// - Less efficient
// - Grid must deep-watch all properties
// - Loses optimization benefits
```

**Solution C: Create wrapper (still spreads)**

```typescript
function updateCueReactive(cueId: string, updates) {
  store.updateCue(cueId, updates)  // Mutate
  // Signal Vue of change by spreading
  document.value = { ...document.value }
}

// Result: End up spreading anyway!
```

---

## SUMMARY TABLE

| Pattern | Current (Immutable) | Mutable Alternative | Trade-off |
|---------|---------------------|---------------------|-----------|
| **Pending** | 14 lines × 2 paths = 28 lines | 14 lines × 1 path = 14 lines | Helper function saves 15 lines while keeping immutable |
| **Spread (store)** | 7 spreads | 0 spreads (but Vue reactivity issues) | Must handle Vue manually |
| **Spread (utils)** | 4 spreads | 0 spreads (but grid issues) | Must call refreshCells() manually |
| **Object.freeze()** | 6 calls | 0 calls | Lose runtime safety |
| **Tests** | +50 lines (verify immutability) | 0 lines | No verification possible |
| **Total code** | ~800 lines | ~550 lines | Lose compile-time safety |

---

## CONCLUSION

The current immutable approach is **correct and appropriate**. Code can be improved by:

1. **Extracting pending pattern to helper** (keeps immutable, saves 15 lines)
2. **Removing freeze from sortCues()** (keeps 5 freeze calls, minimal risk)
3. **Adding JSDoc comments** (document immutability contract)

Switching to mutable would save ~250 lines but would require:
- Manual Vue reactivity handling
- Manual AG Grid refresh calls
- Removing compile-time safety
- Losing debuggability

**Not worth it.**

