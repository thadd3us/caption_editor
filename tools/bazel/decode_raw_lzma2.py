"""Decode a raw LZMA2 stream (no .xz/.7z container) to a file.

pyke's prebuilt ONNX Runtime archives (the `*.tar.lzma2` URLs in ort-sys's
`build/download/dist.txt`) are a bare LZMA2 stream wrapped around a tar.
Bazel's `repository_ctx.extract` understands `.tar.xz` -- LZMA2 *inside* an xz
container -- but not this, so `//tools/bazel:onnxruntime.bzl` runs this script
to strip the compression and then lets Bazel extract the plain tar.

Usage: decode_raw_lzma2.py <input.tar.lzma2> <output.tar>
"""

import lzma
import sys

# A raw stream does not record the encoder's dictionary size, and the decoder
# needs one at least that large. 256 MiB comfortably exceeds the uncompressed
# size of every archive we fetch (~70-100 MiB), and LZMA2 never references
# further back than the data it has already produced.
_DICT_SIZE = 1 << 28


def main() -> None:
    src, dst = sys.argv[1], sys.argv[2]
    decoder = lzma.LZMADecompressor(
        format=lzma.FORMAT_RAW,
        filters=[{"id": lzma.FILTER_LZMA2, "dict_size": _DICT_SIZE}],
    )
    with open(src, "rb") as f_in, open(dst, "wb") as f_out:
        while chunk := f_in.read(1 << 20):
            f_out.write(decoder.decompress(chunk))
    if not decoder.eof:
        sys.exit(f"{src}: LZMA2 stream ended early (truncated download?)")


if __name__ == "__main__":
    main()
