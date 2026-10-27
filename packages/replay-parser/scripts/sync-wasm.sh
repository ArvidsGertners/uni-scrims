#!/usr/bin/env bash
# Copy a tagged build of the parser fork into wasm/ and record its source.
# Usage: pnpm --filter @uni-scrims/replay-parser sync-wasm <path to the fork checkout>
# The fork must be clean, HEAD tagged us-v*, and pkg/ built from that HEAD
# (scripts/build-wasm.sh in the fork writes pkg/BUILD_COMMIT).
set -euo pipefail
fork="$(cd "${1:?usage: sync-wasm.sh <fork checkout>}" && pwd)"
here="$(cd "$(dirname "$0")/.." && pwd)"

[[ -z "$(git -C "$fork" status --porcelain)" ]] || { echo "fork has uncommitted changes" >&2; exit 1; }
tag="$(git -C "$fork" describe --tags --exact-match --match 'us-v*' HEAD 2>/dev/null)" \
  || { echo "fork HEAD has no us-v* tag" >&2; exit 1; }
commit="$(git -C "$fork" rev-parse HEAD)"
for f in vrf_wasm.js vrf_wasm.d.ts vrf_wasm_bg.wasm BUILD_COMMIT; do
  [[ -f "$fork/pkg/$f" ]] || { echo "missing $fork/pkg/$f, run scripts/build-wasm.sh in the fork" >&2; exit 1; }
done
# pkg/ is git-ignored, so only the commit the build recorded proves it is HEAD's.
[[ "$(cat "$fork/pkg/BUILD_COMMIT")" == "$commit" ]] \
  || { echo "pkg/ was built from $(cat "$fork/pkg/BUILD_COMMIT"), not HEAD $commit; rebuild" >&2; exit 1; }

rm -f "$here"/wasm/*
cp "$fork"/pkg/vrf_wasm.js "$fork"/pkg/vrf_wasm.d.ts "$fork"/pkg/vrf_wasm_bg.wasm "$here/wasm/"
sha="$(sha256sum "$here/wasm/vrf_wasm_bg.wasm" | cut -d' ' -f1)"
cat > "$here/wasm/source.json" <<JSON
{
  "fork": "uni-scrims-replay-parser",
  "upstream": "https://github.com/yakisoba0728/vrfkit",
  "tag": "$tag",
  "commit": "$commit",
  "wasmSha256": "$sha"
}
JSON
echo "synced $tag ($commit)"
