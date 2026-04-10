#!/usr/bin/env python3
"""Bulk ASR and speaker embedding for directory trees.

Walks a directory, finds all caption-able media files, and runs ASR +
speaker embedding on each — loading the NN models only once.

Design decisions:

  * **Resumable**: files with an existing ``.captions_json`` sidecar are
    skipped.  You can Ctrl-C at any time and re-run; completed files
    persist because every write is an **atomic rename** (write to temp
    file in the same directory, then ``os.replace``).

  * **Single pass, both models loaded**: ASR and speaker-embedding models
    are loaded simultaneously at startup.  After transcribing a file we
    immediately embed it using the WAV that is still in the temp dir —
    no second audio-extraction pass needed.  Parakeet (~600 MB) +
    wespeaker (~50 MB) fit comfortably in RAM/VRAM together.

  * **Progress by audio-minutes**: TQDM bar tracks minutes of audio
    processed, not file count.  Durations are probed upfront via ffmpeg
    (header-only read, fast even on multi-hour files).

  * **Mock recognizer for testing**: ``--recognizer mock`` swaps the real
    ASR model for a fast deterministic stub, enabling pytest coverage of
    the full pipeline without downloading model weights.

Example usage::

    # Real ASR + embedding on a directory tree
    cd transcribe
    uv run python bulk_cli.py /path/to/media/

    # Dry run with mock recognizer
    uv run python bulk_cli.py /path/to/media/ --recognizer mock

    # Re-embed everything (e.g. after changing segment boundaries)
    uv run python bulk_cli.py /path/to/media/ --always-update-speaker-embeddings
"""

import logging
import os
import signal
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional

import typer
from tqdm import tqdm

from audio_utils import extract_audio_to_wav
from captions_json_lib import (
    parse_captions_json_file,
    serialize_captions_json,
)
from constants import MODEL_PARAKEET, MODEL_VOXCELEB
from recognizer import Recognizer, create_recognizer
from transcribe_cli import build_captions_document

logger = logging.getLogger(__name__)

app = typer.Typer(help="Bulk transcribe and embed media files in a directory tree.")

# ── Media extensions (same set the Electron app supports) ─────────────
MEDIA_EXTENSIONS = frozenset(
    {".mp4", ".webm", ".ogg", ".mp3", ".aac", ".wav", ".mov", ".m4a", ".flac"}
)

# ── Graceful shutdown ─────────────────────────────────────────────────
_shutdown_requested = False


def _sigint_handler(signum, frame):
    global _shutdown_requested
    _shutdown_requested = True
    # Let the user know we heard them — tqdm might swallow a bare newline.
    sys.stderr.write("\nInterrupt received, finishing current file…\n")


# ── Helpers ───────────────────────────────────────────────────────────


def find_media_files(root: Path) -> list[Path]:
    """Recursively find all media files under *root*, sorted for determinism."""
    media: list[Path] = []
    for dirpath, _dirnames, filenames in os.walk(root):
        for fname in filenames:
            if Path(fname).suffix.lower() in MEDIA_EXTENSIONS:
                media.append(Path(dirpath) / fname)
    media.sort()
    return media


def captions_path_for(media_path: Path) -> Path:
    """Return the sidecar ``.captions_json`` path for a media file."""
    return media_path.with_suffix(".captions_json")


def get_audio_duration_seconds(media_path: Path) -> float:
    """Fast duration probe via ffmpeg (reads container header only).

    Uses ``ffmpeg -i`` and parses the ``Duration:`` line from stderr,
    which works regardless of whether ``ffprobe`` is bundled.
    """
    import imageio_ffmpeg

    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    try:
        result = subprocess.run(
            [ffmpeg_exe, "-i", str(media_path)],
            capture_output=True,
            text=True,
            timeout=30,
        )
        # ffmpeg writes info to stderr (and returns non-zero when no output
        # file is given, which is fine — we just want the Duration line).
        for line in result.stderr.splitlines():
            line = line.strip()
            if line.startswith("Duration:"):
                # "Duration: 00:02:33.45, start: …"
                dur_str = line.split(",")[0].replace("Duration:", "").strip()
                parts = dur_str.split(":")
                hours, minutes, seconds = (
                    float(parts[0]),
                    float(parts[1]),
                    float(parts[2]),
                )
                return hours * 3600 + minutes * 60 + seconds
    except Exception as e:
        logger.warning(f"Could not probe duration for {media_path}: {e}")
    return 0.0


def atomic_write_captions_json(path: Path, document, *, captions_path: Optional[Path] = None) -> None:
    """Write a CaptionsDocument to *path* via atomic rename.

    Writes to a temp file in the same directory then ``os.replace()``s it
    to the target.  On POSIX this is a single rename syscall — if the
    process is killed mid-write the target is never left in a truncated
    state.
    """
    effective_path = captions_path or path
    content = serialize_captions_json(document, captions_path=effective_path)
    fd = -1
    tmp_path = ""
    try:
        fd, tmp_path = tempfile.mkstemp(
            dir=str(path.parent), suffix=".captions_json.tmp"
        )
        os.write(fd, content.encode("utf-8"))
        os.close(fd)
        fd = -1  # mark as closed
        os.replace(tmp_path, str(path))
    except BaseException:
        if fd >= 0:
            os.close(fd)
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise


# ── Main CLI ──────────────────────────────────────────────────────────


@app.command()
def main(
    directory: Path = typer.Argument(
        ...,
        exists=True,
        file_okay=False,
        dir_okay=True,
        readable=True,
        help="Root directory to scan for media files.",
    ),
    model: str = typer.Option(
        MODEL_PARAKEET,
        "--model",
        "-m",
        help="ASR model name.",
    ),
    embed_model: str = typer.Option(
        MODEL_VOXCELEB,
        "--embed-model",
        help="Speaker embedding model name.",
    ),
    always_update_speaker_embeddings: bool = typer.Option(
        False,
        "--always-update-speaker-embeddings",
        help=(
            "Re-run speaker embeddings even on files that already have a "
            ".captions_json (useful after segment-boundary changes)."
        ),
    ),
    chunk_size: int = typer.Option(60, "--chunk-size", "-c"),
    overlap: int = typer.Option(5, "--overlap", "-v"),
    max_intra_segment_gap_seconds: float = typer.Option(
        0.50, "--max-intra-segment-gap-seconds"
    ),
    max_segment_duration_seconds: float = typer.Option(
        10.0, "--max-segment-duration-seconds"
    ),
    min_segment_duration: float = typer.Option(
        0.3, "--min-segment-duration"
    ),
    recognizer_kind: str = typer.Option(
        "auto",
        "--recognizer",
        help="'auto' uses the real model; 'mock' uses a fast deterministic stub.",
    ),
) -> None:
    """Bulk-transcribe and embed all media files under DIRECTORY."""

    # ── 1. Scan ───────────────────────────────────────────────────────
    typer.echo(f"Scanning {directory} …")
    all_media = find_media_files(directory)
    typer.echo(f"Found {len(all_media)} media files.")

    if not all_media:
        raise typer.Exit(0)

    # ── 2. Partition into work lists ──────────────────────────────────
    needs_asr: list[Path] = []          # full ASR + embedding
    needs_embed_only: list[Path] = []   # already have captions, re-embed

    for media in all_media:
        cp = captions_path_for(media)
        if not cp.exists():
            needs_asr.append(media)
        elif always_update_speaker_embeddings:
            needs_embed_only.append(media)
        # else: skip

    skipped = len(all_media) - len(needs_asr) - len(needs_embed_only)
    typer.echo(
        f"  {len(needs_asr)} need ASR, "
        f"{len(needs_embed_only)} need re-embedding, "
        f"{skipped} already done."
    )

    if not needs_asr and not needs_embed_only:
        typer.echo("Nothing to do.")
        raise typer.Exit(0)

    # ── 3. Probe durations for TQDM ───────────────────────────────────
    typer.echo("Probing audio durations…")
    durations: dict[Path, float] = {}
    for media in tqdm(needs_asr + needs_embed_only, desc="Probing", unit="file"):
        durations[media] = get_audio_duration_seconds(media)

    total_minutes = sum(durations.values()) / 60.0
    typer.echo(f"Total audio to process: {total_minutes:.1f} minutes")

    # ── 4. Load models ────────────────────────────────────────────────
    use_mock = recognizer_kind == "mock"

    recognizer: Optional[Recognizer] = None
    if needs_asr:
        typer.echo(f"Loading ASR model: {model if not use_mock else '(mock)'} …")
        recognizer = create_recognizer(model, mock=use_mock)

    embed_inference = None
    if needs_asr or needs_embed_only:
        if use_mock:
            # For mock mode, create a trivial embedding callable.
            import numpy as _np

            class _MockInference:
                def __call__(self, audio_dict):
                    return _np.zeros(192, dtype=_np.float32)

            embed_inference = _MockInference()
            typer.echo("Using mock embedding model.")
        else:
            typer.echo(f"Loading embedding model: {embed_model} …")
            from embed_cli import load_embedding_model

            embed_inference = load_embedding_model(embed_model)

    # ── 5. Install signal handler ─────────────────────────────────────
    prev_handler = signal.signal(signal.SIGINT, _sigint_handler)

    # ── 6. Process ────────────────────────────────────────────────────
    completed = 0
    failed = 0

    try:
        with tqdm(
            total=total_minutes,
            desc="Processing",
            unit="min",
            bar_format="{l_bar}{bar}| {n:.1f}/{total:.1f} min [{elapsed}<{remaining}]",
        ) as pbar:

            # ── ASR pass ──────────────────────────────────────────────
            for media in needs_asr:
                if _shutdown_requested:
                    break

                cp = captions_path_for(media)
                dur_min = durations[media] / 60.0

                try:
                    with tempfile.TemporaryDirectory() as td:
                        wav_path = extract_audio_to_wav(
                            media, Path(td) / "audio.wav"
                        )

                        assert recognizer is not None
                        asr_segments = recognizer.transcribe(
                            wav_path,
                            chunk_size=chunk_size,
                            overlap=overlap,
                            max_intra_segment_gap_seconds=max_intra_segment_gap_seconds,
                            max_segment_duration_seconds=max_segment_duration_seconds,
                        )

                        document = build_captions_document(
                            media, wav_path, asr_segments, model
                        )

                        # Embed in the same pass (WAV already extracted)
                        if embed_inference is not None:
                            from embed_cli import embed_document

                            embed_document(
                                document,
                                wav_path,
                                embed_inference,
                                embed_model,
                                min_segment_duration=min_segment_duration,
                            )

                        cp.parent.mkdir(parents=True, exist_ok=True)
                        atomic_write_captions_json(cp, document)

                    completed += 1
                    tqdm.write(f"✓ {media.name}")

                except Exception as e:
                    failed += 1
                    tqdm.write(f"✗ {media.name}: {e}")

                pbar.update(dur_min)

            # ── Embedding-only pass ───────────────────────────────────
            for media in needs_embed_only:
                if _shutdown_requested:
                    break

                cp = captions_path_for(media)
                dur_min = durations[media] / 60.0

                try:
                    document = parse_captions_json_file(cp)

                    with tempfile.TemporaryDirectory() as td:
                        wav_path = extract_audio_to_wav(
                            media, Path(td) / "audio.wav"
                        )

                        if embed_inference is not None:
                            from embed_cli import embed_document

                            embed_document(
                                document,
                                wav_path,
                                embed_inference,
                                embed_model,
                                min_segment_duration=min_segment_duration,
                            )

                        atomic_write_captions_json(cp, document)

                    completed += 1
                    tqdm.write(f"✓ (embed) {media.name}")

                except Exception as e:
                    failed += 1
                    tqdm.write(f"✗ (embed) {media.name}: {e}")

                pbar.update(dur_min)

    finally:
        signal.signal(signal.SIGINT, prev_handler)

    # ── 7. Summary ────────────────────────────────────────────────────
    total = len(needs_asr) + len(needs_embed_only)
    typer.echo(f"\nDone: {completed}/{total} succeeded, {failed} failed.")
    if _shutdown_requested:
        typer.echo("(interrupted — re-run to process remaining files)")


if __name__ == "__main__":
    app()
