#!/usr/bin/env bash
# Regenerate src/api/generated from the api repo's OpenAPI bundle — or prove the
# committed copies still match it.
#
#   openapi-gen.sh            regenerate in place   (make openapi)
#   openapi-gen.sh --check    diff, exit 1 on drift (make openapi-check)
#
# Both modes generate into a temp directory and only then copy or diff, so the
# gate cannot pass because it generated the files differently from the writer.
#
# The bundle lives in the api repo on purpose (docs/factory/README.md §1): a
# contract this repo's agent can edit is not a contract.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACT="${CONTRACT:-$ROOT/../clockwise-like/contracts/openapi/openapi.yaml}"
OUT_DIR="$ROOT/src/api/generated"
BIN="$ROOT/node_modules/.bin"

CHECK=0
if [ "${1:-}" = "--check" ]; then
  CHECK=1
elif [ -n "${1:-}" ]; then
  echo "usage: $(basename "$0") [--check]" >&2
  exit 2
fi

if [ ! -f "$CONTRACT" ]; then
  echo "no contract at $CONTRACT" >&2
  echo "  The bundle lives in the api repo. Clone it as a sibling:" >&2
  echo "    git clone git@github.com:Enach/clockwise-like.git ../clockwise-like" >&2
  echo "  or point at it: make openapi CONTRACT=/path/to/contracts/openapi/openapi.yaml" >&2
  exit 1
fi

for tool in openapi-typescript typed-openapi; do
  if [ ! -x "$BIN/$tool" ]; then
    echo "$tool not installed, install with: npm install" >&2
    echo "  (it is a pinned devDependency; do not npx a floating version — the" >&2
    echo "   generated files are committed and must be byte-identical everywhere)" >&2
    exit 1
  fi
done

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# types.ts — the zero-runtime type surface every hook and adapter imports from.
"$BIN/openapi-typescript" "$CONTRACT" -o "$tmp/types.ts"

# schemas.ts — standalone zod schemas for validating what the server actually
# sent. See src/api/generated/README.md for why this generator and not a client
# generator.
"$BIN/typed-openapi" "$CONTRACT" -o "$tmp/schemas.ts" --runtime zod

if [ "$CHECK" -eq 1 ]; then
  rc=0
  for f in types.ts schemas.ts; do
    if [ ! -f "$OUT_DIR/$f" ]; then
      echo "FAIL: src/api/generated/$f is missing; run \`make openapi\` and commit it" >&2
      rc=1
      continue
    fi
    if ! diff -u "$OUT_DIR/$f" "$tmp/$f" > "$tmp/$f.diff" 2>&1; then
      echo "FAIL: src/api/generated/$f is out of date with the contract." >&2
      echo "      The contract moves first (factory §1): if the backend PR has merged," >&2
      echo "      run \`make openapi\` and commit. First 40 diff lines:" >&2
      head -n 40 "$tmp/$f.diff" >&2
      rc=1
    fi
  done
  [ "$rc" -eq 0 ] || exit 1
  echo "OK: src/api/generated matches the contract"
else
  mkdir -p "$OUT_DIR"
  cp "$tmp/types.ts" "$tmp/schemas.ts" "$OUT_DIR/"
  echo "wrote src/api/generated/{types.ts,schemas.ts} from ${CONTRACT}"
fi
