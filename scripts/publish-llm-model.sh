#!/usr/bin/env bash
set -euo pipefail

REPOSITORY="${KTK_GITHUB_REPOSITORY:-itacher173-arch/myBestKtKProject}"
TAG="${KTK_LLM_RELEASE_TAG:-ai-model-qwen2.5-0.5b-v1}"
MODEL_FILE="Qwen2.5-0.5B-Instruct-Q4_K_M.gguf"
MODEL_PATH="${KTK_LLM_MODEL_PATH:-backend/runtime/models/${MODEL_FILE}}"
EXPECTED_SHA256="6eb923e7d26e9cea28811e1a8e852009b21242fb157b26149d3b188f3a8c8653"

command -v gh >/dev/null || {
  echo "GitHub CLI (gh) не установлен." >&2
  exit 1
}
gh auth status >/dev/null
test -f "${MODEL_PATH}" || {
  echo "Модель не найдена: ${MODEL_PATH}" >&2
  exit 1
}

ACTUAL_SHA256="$(shasum -a 256 "${MODEL_PATH}" | awk '{print $1}')"
if [[ "${ACTUAL_SHA256}" != "${EXPECTED_SHA256}" ]]; then
  echo "SHA-256 модели не совпадает с manifest.json." >&2
  exit 1
fi

if gh release view "${TAG}" --repo "${REPOSITORY}" >/dev/null 2>&1; then
  gh release upload "${TAG}" "${MODEL_PATH}#${MODEL_FILE}" \
    --repo "${REPOSITORY}" \
    --clobber
else
  gh release create "${TAG}" "${MODEL_PATH}#${MODEL_FILE}" \
    --repo "${REPOSITORY}" \
    --title "Local AI model: Qwen2.5 0.5B Q4_K_M" \
    --notes "GGUF runtime artifact for the local llama.cpp service. Source and checksum: backend/ai/models/llm/manifest.json."
fi

echo "Published: https://github.com/${REPOSITORY}/releases/tag/${TAG}"
