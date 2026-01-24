#!/bin/bash
set -e

EXTRACTED="/home/agnij/Desktop/TVA-Protocol/tooling/llvm16/extracted"
LLVM_PREFIX="$EXTRACTED/usr/lib/llvm-16"
export LLVM_SYS_160_PREFIX="$LLVM_PREFIX"
export PATH="$LLVM_PREFIX/bin:$PATH"
export LD_LIBRARY_PATH="$EXTRACTED/usr/lib/x86_64-linux-gnu:$LLVM_PREFIX/lib:${LD_LIBRARY_PATH:-}"
export LIBRARY_PATH="$LLVM_PREFIX/lib:$EXTRACTED/usr/lib/x86_64-linux-gnu:${LIBRARY_PATH:-}"
# Force static linking of LLVM to avoid conflicts with rustc's LLVM 20
export LLVM_LINK_STATIC=1

cd /home/agnij/Desktop/TVA-Protocol/tooling/solang

# Ensure target dirs exist for stdlib build
mkdir -p target/bpf target/wasm

echo "Using LLVM from: $LLVM_PREFIX"
echo "llvm-config: $(which llvm-config)"
echo "clang: $(which clang)"
llvm-config --version

echo ""
echo "Starting cargo build..."
cargo build --release --no-default-features --features "llvm,soroban"

echo ""
echo "Build complete!"
ls -la target/release/solang
