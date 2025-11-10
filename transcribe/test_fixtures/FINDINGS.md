# Raw Whisper ASR Output Analysis

## Summary of Findings

### 1. Full-File Processing (whisper_full_file_raw_output.json)

**Processing:** Entire 33.62s audio file in one pass

**Output:** 82 words with word-level timestamps

**Sentence Boundaries Detected:**
- Word 8 ("planks.") → Word 9 ("Glue"): **0.600s gap**
- Word 16 ("background.") → Word 17 ("It"): **1.240s gap**
- Word 26 ("well.") → Word 27 ("These"): **0.420s gap**
- Word 35 ("dish.") → Word 36 ("Rice"): **0.300s gap**
- Word 49 ("punch.") → Word 50 ("The"): **0.280s gap**

**Conclusion:** With 0.2s threshold, we get perfect sentence-level segmentation (5 natural sentence boundaries detected).

### 2. Chunked Processing (whisper_chunked_10s_raw_output.json)

**Processing:** 10s chunks with 5s overlap (6 chunks total)

**Output:**
- 6 chunks processing the full audio
- **136 words** total across all chunks

**Issue:** Whisper with 10s chunks extends word durations to fill time, **hiding sentence boundaries**. Even with correct sample rate, 10s chunks produce poor word-level timestamps.

**Example:** The gap between "planks." and "Glue" is:
- Full-file: **0.600s gap** (clear sentence boundary)
- 10s chunks: **0.000s gap** (no boundary detected)

## Problem with 10s Chunked Approach

1. Whisper extends word durations in short chunks
2. Gaps between words disappear (filled with extended duration)
3. Gap-based splitting cannot detect sentence boundaries
4. Duration-based splitting becomes the only option (less natural segmentation)

## Recommendations

### Option 1: Use Full-File Processing (Recommended)

For accurate word-level timestamps and natural sentence boundaries:
- Process the entire file at once
- Clean sentence boundaries with 0.2s threshold
- **Result: 7 sentence-level segments with proper gaps**

### Option 2: Use Larger Chunks (If Chunking Required)

If chunking is needed for memory constraints:
- Use chunks ≥ 30s (longer is better)
- 10s chunks hide sentence boundaries
- Duration-based splitting will be primary segmentation method

## Word-Level Timestamp Quality

Within sentences, most consecutive words have gaps < 0.05s, many exactly 0.0s:
- This is normal for Whisper's word-level timestamps
- Words within a sentence are tightly packed
- Sentence boundaries are clear (0.2s+ gaps)

## Files Generated

- `whisper_full_file_raw_output.json` - Full file processing (82 words, clean gaps)
- `whisper_chunked_10s_raw_output.json` - 10s chunked processing (136 words, gaps hidden)
- `capture_raw_asr_output.py` - Script to regenerate these files
