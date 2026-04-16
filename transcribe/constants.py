MODEL_WHISPER_TINY = "openai/whisper-tiny"
MODEL_PARAKEET = "nvidia/parakeet-tdt-0.6b-v3"

MODEL_VOXCELEB = "pyannote/wespeaker-voxceleb-resnet34-LM"

# Same string as `ASR_COMMIT_HASH` in electron/constants.ts (update both when pinning).
#
# This value is *not* how uvx chooses what to fetch — the Electron app passes the rev.
# It is used for schema links in `.captions_json5` headers when running this Python
# package. After a two-step release (version commit A, then “sync hash” commit B), a
# bare checkout at A still contains the *old* hash here until B; that is expected.
ASR_COMMIT_HASH = "51cb2c3d665317c2c428d2e204d39f84441b83a2"
