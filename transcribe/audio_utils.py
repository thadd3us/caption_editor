"""Shared audio utilities for transcription and embedding."""

import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf


def extract_audio_to_wav(media_file: Path, output_path: Path) -> Path:
    """Extract/convert audio from media file to WAV format using ffmpeg.

    Converts to 16kHz mono WAV, suitable for ASR and speaker embedding models.

    Raises:
        ValueError: If ffmpeg conversion fails.
    """
    cmd = [
        "ffmpeg",
        "-i",
        str(media_file),
        "-ar",
        "16000",  # 16kHz sample rate
        "-ac",
        "1",  # Mono
        "-f",
        "wav",
        "-y",  # Overwrite
        str(output_path),
    ]

    try:
        subprocess.run(cmd, check=True, capture_output=True)
    except subprocess.CalledProcessError as e:
        stderr = e.stderr.decode() if e.stderr else "Unknown error"
        raise ValueError(f"Error extracting audio: {stderr}")

    return output_path


def load_audio_segment(
    audio_path: Path, start_time: float, end_time: float
) -> tuple[np.ndarray, int]:
    """Load a segment of audio from a file.

    Returns:
        Tuple of (audio_data, sample_rate). Returns empty array if start_time
        is beyond the file duration.
    """
    info = sf.info(audio_path)
    sample_rate = info.samplerate

    start_frame = int(start_time * sample_rate)
    num_frames = int((end_time - start_time) * sample_rate)

    if start_frame >= info.frames:
        return np.array([]), sample_rate

    num_frames = min(num_frames, info.frames - start_frame)

    audio, sr = sf.read(
        audio_path, start=start_frame, frames=num_frames, dtype="float32"
    )
    return audio, sr
