"""Prebuilt ONNX Runtime for `ort-sys`, fetched by Bazel instead of by its build script.

Left to itself, ort-sys's build script downloads ONNX Runtime into
`~/Library/Caches/ort.pyke.io` (`~/.cache/ort.pyke.io` on Linux) and prints that
absolute path as a link-search directory. Bazel caches the build script's
*output* but knows nothing about that directory, so a runner that restores the
script's result from the disk cache -- without running it -- and then recompiles
`ort_sys` links against a directory that does not exist there:

    error: could not find native static library `onnxruntime`

That is what turned main's CI red after the Linux .deb change shifted cache keys.
Here the library is an ordinary Bazel input: pinned by hash, in the repository
cache, and handed to ort-sys through `ORT_LIB_LOCATION` (see the `ort-sys`
`crate.annotation` in MODULE.bazel), which makes the script skip its download.

The URLs and hashes are copied from ort-sys's `build/download/dist.txt`, feature
set `none` -- the variant ort-sys itself picks with our features (no cuda,
webgpu, training, ...). **They must move with `ort`.** Bumping ort/ort-sys means
copying the new lines from the new crate's `dist.txt`; the old pins will still
build, but against the old ONNX Runtime, behind the Rust bindings' back.
"""

# ort-sys 2.0.0-rc.12 -> ONNX Runtime 1.24.2.
_DISTS = {
    "aarch64-apple-darwin": struct(
        url = "https://cdn.pyke.io/0/pyke:ort-rs/ms@1.24.2/aarch64-apple-darwin.tar.lzma2",
        sha256 = "612739f75438dc0a075461e1fb454226b4a1eb175e60a7271ba966bbbb972cd4",
    ),
    "x86_64-unknown-linux-gnu": struct(
        url = "https://cdn.pyke.io/0/pyke:ort-rs/ms@1.24.2/x86_64-unknown-linux-gnu.tar.lzma2",
        sha256 = "acc1cba79c337594ead1d88ca72516147aa60054c84217b53399a31caa5ba671",
    ),
}

_BUILD = """\
load("@aspect_bazel_lib//lib:copy_to_directory.bzl", "copy_to_directory")

# ort-sys wants a *directory* in ORT_LIB_LOCATION, and `$(execpath)` of a file
# cannot be turned into its parent. A tree artifact gives `$(execpath :lib)` a
# directory to point at, and keeps the input tracked soundly (a bare source
# directory would not be).
copy_to_directory(
    name = "lib",
    srcs = ["libonnxruntime.a"],
    visibility = ["//visibility:public"],
)
"""

def _host_triple(rctx):
    os = rctx.os.name.lower()
    arch = rctx.os.arch.lower()
    if os.startswith("mac") and arch in ("aarch64", "arm64"):
        return "aarch64-apple-darwin"
    if os.startswith("linux") and arch in ("amd64", "x86_64"):
        return "x86_64-unknown-linux-gnu"
    fail("No prebuilt ONNX Runtime pinned for {} / {}; add one to _DISTS in //tools/bazel:onnxruntime.bzl".format(os, arch))

def _onnxruntime_prebuilt_impl(rctx):
    dist = _DISTS[_host_triple(rctx)]

    # `download` checks the hash, so a moved or replaced file fails here rather
    # than at link time.
    rctx.download(url = dist.url, output = "onnxruntime.tar.lzma2", sha256 = dist.sha256)

    python = rctx.which("python3")
    if not python:
        fail("python3 is needed on PATH to unpack the ONNX Runtime archive")
    result = rctx.execute([
        python,
        "-I",
        rctx.path(Label("//tools/bazel:decode_raw_lzma2.py")),
        "onnxruntime.tar.lzma2",
        "onnxruntime.tar",
    ])
    if result.return_code != 0:
        fail("decoding the ONNX Runtime archive failed:\n" + result.stderr)
    rctx.extract("onnxruntime.tar")
    rctx.delete("onnxruntime.tar.lzma2")
    rctx.delete("onnxruntime.tar")

    if not rctx.path("libonnxruntime.a").exists:
        fail("libonnxruntime.a is not at the top of the ONNX Runtime archive; has its layout changed?")
    rctx.file("BUILD.bazel", _BUILD)

onnxruntime_prebuilt = repository_rule(
    implementation = _onnxruntime_prebuilt_impl,
    doc = "pyke's prebuilt static ONNX Runtime for the host platform.",
)

def _onnxruntime_impl(module_ctx):
    onnxruntime_prebuilt(name = "onnxruntime")
    return module_ctx.extension_metadata(reproducible = True)

onnxruntime = module_extension(implementation = _onnxruntime_impl)
