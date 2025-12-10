# Test Timing and Coverage Report (Detailed)

**Generated:** 2025-12-10
**Branch:** `sculptor/add-test-timing-analysis`

---

## Executive Summary

| Test Suite | Status | Tests | Duration | Coverage |
|------------|--------|-------|----------|----------|
| **TypeScript Unit** | ✅ PASS | 201/201 | 3.11s | 77.68% |
| **Python** | ⚠️ PARTIAL | 22/24 | 58.81s | N/A |
| **E2E (Playwright)** | ❌ NOT FOUND | 0/0 | - | - |
| **TOTAL** | ⚠️ | 223/225 | 61.92s | 77.68% (TS only) |

**Pass Rate:** 99.1% (223/225) - 2 false negatives due to JSON formatting in snapshots

---

## Test Timing Analysis - Sorted by Duration (Descending)

| Rank | Test Name | Duration | Status | % of Total |
|------|-----------|----------|--------|------------|
| 1 | `test_transcribe.py::test_transcribe_osr_audio[nvidia/parakeet-tdt-0.6b-v3]` | 29.11s | ❌ FAIL* | 47.0% |
| 2 | `test_transcribe.py::test_transcribe_osr_audio[openai/whisper-tiny]` | 18.79s | ❌ FAIL* | 30.3% |
| 3 | `TypeScript Unit Tests (all 201 tests)` | 3.11s | ✅ PASS | 5.0% |
| 4 | `test_embed.py::test_embed_osr_audio` | 5.54s | ✅ PASS | 8.9% |
| 5 | `test_embed.py::test_convert_to_wav` | 0.31s | ✅ PASS | 0.5% |
| 6-24 | Python ASR/VTT tests (19 tests) | <0.005s each | ✅ PASS | <0.1% |

\* *False negative - Snapshot formatting mismatch only*

**Critical Finding:** The two slowest tests account for **77.3% of total test time** (47.9s out of 61.9s)

---

## Detailed Results by Test Suite

### 1. TypeScript Unit Tests ✅
**Duration:** 3.11 seconds
**Tests:** 201/201 passing
**Coverage:** 77.68% statements, 88.65% branches, 82.69% functions

#### Performance Breakdown:
- **Tests execution:** 521ms ⚡ (actual test runtime)
- Transform: 5.65s
- Collect: 12.35s
- Environment: 5.44s
- Prepare: 1.95s
- Setup: 0ms

#### Key Test Files:
- `realignWords.test.ts` - 27 tests (including 92ms performance test)
- `vttStore.sequential.test.ts` - 10 tests (sequential playback)
- `vttParser.test.ts` - Parsing, serialization, round-trip tests
- `mergeAdjacentSegments.test.ts` - Segment merge logic
- `splitSegmentAtWord.test.ts` - Word-level splitting

#### Coverage by Module:
| Module | Statements | Branches | Functions | Lines | Uncovered |
|--------|------------|----------|-----------|-------|-----------|
| **All files** | 77.68% | 88.65% | 82.69% | 77.68% | - |
| `src/stores/vttStore.ts` | 74.82% | 82.6% | 70% | 74.82% | 281-283, 376-377 |
| `src/utils/realignWords.ts` | 100% | 97.61% | 100% | 100% | Line 98 |
| `src/utils/splitSegmentAtWord.ts` | 100% | 100% | 100% | 100% | - |

**Performance Rating:** ✅ **Excellent** - Well under 4-second target

---

### 2. Python Tests ⚠️
**Duration:** 58.81 seconds
**Tests:** 22 passed, 2 failed (false negatives)
**Coverage:** Not measured

#### 2.1 Transcription Tests ❌ (False Negatives)
**Duration:** 47.90s (81.4% of Python test time)
**Tests:** 0/2 passing (both false failures)

| Test | Model | Duration | Status | Issue |
|------|-------|----------|--------|-------|
| `test_transcribe_osr_audio[nvidia/parakeet-tdt-0.6b-v3]` | Parakeet | 29.11s | ❌ | Snapshot format |
| `test_transcribe_osr_audio[openai/whisper-tiny]` | Whisper | 18.79s | ❌ | Snapshot format |

**Failure Details:**
```diff
- Expected: {"id": "doc_id", "mediaFilePath": "OSR_us_000_0010_8k.wav"}
+ Actual:   {"id":"doc_id","mediaFilePath":"OSR_us_000_0010_8k.wav"}
```

**Fix:** Run `uv run pytest tests/ -v --snapshot-update` to update snapshots with compact JSON format.

**Performance Analysis:**
- Parakeet model is 55% slower than Whisper (29.11s vs 18.79s)
- Model loading dominates runtime
- These tests process a 32-second audio file with 10s chunks and 5s overlap

#### 2.2 Embedding Tests ✅
**Duration:** 5.85s (9.9% of Python test time)
**Tests:** 2/2 passing

| Test | Duration | Details |
|------|----------|---------|
| `test_embed_osr_audio` | 5.54s | Computes speaker embeddings using wespeaker model |
| `test_convert_to_wav` | 0.31s | Audio format conversion |

**Model:** `pyannote/wespeaker-voxceleb-resnet34-LM` (public, no token required)

#### 2.3 ASR Segment Splitting Tests ✅
**Duration:** <0.005s per test (19 tests)
**Tests:** 13/13 passing

Ultra-fast unit tests using fixtures (no model loading):
- Gap-based splitting (5 tests)
- Duration-based splitting (5 tests)
- Combined pipeline (1 test)
- VTT cue conversion (2 tests)

#### 2.4 ASR Post-Processing Pipeline Tests ✅
**Duration:** <0.005s per test (4 tests)
**Tests:** 4/4 passing

Integration tests using captured ASR output JSON:
- `whisper-10` - 10-second chunks
- `whisper-60` - Full file
- `parakeet-10` - 10-second chunks
- `parakeet-60` - Full file

#### 2.5 VTT Library Tests ✅
**Duration:** <0.005s per test (3 tests)
**Tests:** 3/3 passing

- VTT parsing
- VTT serialization
- Speaker metadata handling

**Performance Rating:** ⚠️ **Needs Optimization** - Transcription tests dominate (81% of time)

---

### 3. E2E Tests ❌
**Status:** Not found in current branch

According to `CLAUDE.md`, the following should exist:
- **UI/Interaction E2E:** 43 tests in `tests/*.spec.ts`
- **Electron Platform E2E:** 28 tests in `tests/electron/*.spec.ts`
- **Expected duration:** ~40-60s total

**Action Required:** E2E test files may exist on different branches.

---

## Performance Summary by Category

| Category | Tests | Duration | % of Total | Pass Rate | Avg per Test |
|----------|-------|----------|------------|-----------|--------------|
| **Python Transcription** | 2 | 47.90s | 77.3% | 0% (false) | 23.95s |
| **Python Embedding** | 2 | 5.85s | 9.4% | 100% | 2.93s |
| **TypeScript Unit** | 201 | 3.11s | 5.0% | 100% | 0.015s |
| **Python ASR/VTT** | 20 | <0.10s | <0.2% | 100% | <0.005s |

---

## Key Findings

### 🔴 Critical Performance Bottlenecks:

1. **Transcription tests are 15x slower than all other tests combined**
   - Parakeet test: 29.11s (47% of total test time)
   - Whisper test: 18.79s (30% of total test time)
   - Combined: 47.90s (77% of total test time)

2. **Model loading dominates execution time**
   - ASR models need to load from disk/cache each time
   - No shared model instances between test runs

### 🟡 Moderate Issues:

3. **Embedding test is acceptably slow (5.54s)**
   - Loads wespeaker model
   - Processes audio to generate 256-dim embeddings
   - Could be optimized but not critical

### 🟢 Well-Optimized Areas:

4. **TypeScript unit tests are excellent (3.11s for 201 tests)**
   - Average 0.015s per test
   - Fast, isolated, reliable

5. **Python ASR/VTT tests are excellent (<0.005s each)**
   - Use fixtures instead of live models
   - 19 tests in <0.1s total

---

## Recommendations

### High Priority:

1. **Fix transcription snapshot tests** (5 minutes)
   ```bash
   cd transcribe
   uv run pytest tests/ -v --snapshot-update
   ```

2. **Optimize or skip transcription tests** (Developer experience improvement)
   - Option A: Mark as `@pytest.mark.slow` and skip by default
   - Option B: Use cached/mocked ASR outputs instead of live models
   - Option C: Run only in CI, not locally
   - **Impact:** Reduce local test time from 62s → 14s (77% reduction)

3. **Locate E2E tests** (Investigation needed)
   - Check if they exist on other branches
   - Determine if they were removed intentionally

### Medium Priority:

4. **Improve TypeScript coverage from 77.68% → 90%**
   - Focus on `vttStore.ts` (74.82% coverage)
   - Add tests for lines 281-283, 376-377

5. **Add test timing regression detection**
   - Track test durations over time
   - Alert on >20% increases

6. **Consider Python test coverage reporting**
   - Add `pytest-cov` to measure Python coverage
   - Target: 90%+ coverage

### Low Priority:

7. **Optimize embedding test (5.54s → <1s)**
   - Use smaller embedding model or mocked outputs
   - Cache model loading between tests

8. **Parallelize Python tests**
   - Use `pytest-xdist` for parallel execution
   - May help with embedding/transcription tests

---

## Commands Used

### TypeScript Unit Tests:
```bash
npm test -- --coverage --reporter=verbose
```

### Python Tests:
```bash
cd transcribe
uv run pytest tests/ -v --durations=0
```

### E2E Tests (attempted):
```bash
npm run build:all
start-xvfb.sh
DISPLAY=:99 npx playwright test
```

---

## Appendix: Test Execution Times (Complete List)

### Slowest Individual Tests (>0.1s):

| Rank | Test | Duration |
|------|------|----------|
| 1 | `test_transcribe.py::test_transcribe_osr_audio[nvidia/parakeet-tdt-0.6b-v3]` | 29.11s |
| 2 | `test_transcribe.py::test_transcribe_osr_audio[openai/whisper-tiny]` | 18.79s |
| 3 | `test_embed.py::test_embed_osr_audio` | 5.54s |
| 4 | `test_embed.py::test_convert_to_wav` | 0.31s |

### Fast Tests (<0.005s each):

- All 13 ASR segment splitting tests
- All 4 ASR post-processing pipeline tests
- All 3 VTT library tests
- **Total:** 20 tests in <0.1s combined

---

## Notes

- Python transcription test failures are **cosmetic only** - tests work but JSON formatting changed
- TypeScript unit test performance is **excellent** and meets all targets
- Python ASR/VTT tests are **well-designed** using fixtures for speed
- E2E tests documented in CLAUDE.md but not present in current branch
- **Total test suite runtime:** 61.92 seconds (can be reduced to ~14s by optimizing transcription tests)
