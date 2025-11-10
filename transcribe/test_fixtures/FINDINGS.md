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

### 2. Chunked Processing (whisper_chunked_raw_output.json)

**Processing:** 10s chunks with 5s overlap (first 3 chunks captured)

**Output:**
- Chunk 0 (0-10s): **325 words**
- Chunk 1 (5-15s): **334 words**
- Chunk 2 (10-20s): **412 words**

**TOTAL: 1071 words vs 82 words in full file!**

**Critical Issue:** Whisper is **hallucinating heavily** when given short audio chunks. The chunked approach produces 13x more "words" than actually exist in the audio.

## Problem with Current Chunked Approach

1. Each chunk produces hundreds of hallucinated words
2. These words have timestamps, but they're mostly gibberish
3. The overlap resolution tries to pick between two sets of hallucinations
4. The result is unpredictable and incorrect

## Recommendations

### Option 1: Use Full-File Processing (Recommended for Short Files)

For files < 60s, process the entire file at once:
- Accurate transcription
- No hallucinations
- Clean sentence boundaries with 0.2s threshold
- **Result: Perfect segmentation**

### Option 2: Fix Chunked Processing

The chunked approach needs fixing:

1. **Root cause:** Whisper hallucinates on short clips
2. **Potential solutions:**
   - Use larger chunks (30-60s minimum)
   - Use a different model for chunked processing
   - Add hallucination detection/filtering
   - Use Whisper's VAD (voice activity detection) features

### Option 3: Hybrid Approach

- Use full-file for files < 60s
- Use chunked only for very long files (with larger chunk sizes)

## Word-Level Timestamp Quality

Within sentences, most consecutive words have gaps < 0.05s, many exactly 0.0s:
- This is normal for Whisper's word-level timestamps
- Words within a sentence are tightly packed
- Sentence boundaries are clear (0.2s+ gaps)

## Files Generated

- `whisper_full_file_raw_output.json` - Full file processing (accurate)
- `whisper_chunked_raw_output.json` - Chunked processing (hallucinations)
- `capture_raw_asr_output.py` - Script to regenerate these files
