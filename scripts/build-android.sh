#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-debug}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ensure_release_signing_env() {
  local required=(
    ANDROID_KEYSTORE_PATH
    ANDROID_KEYSTORE_PASSWORD
    ANDROID_KEY_ALIAS
    ANDROID_KEY_PASSWORD
  )

  local missing=()
  local key
  for key in "${required[@]}"; do
    if [[ -z "${!key:-}" ]]; then
      missing+=("$key")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "[build-android] release signing env is required."
    echo "[build-android] missing: ${missing[*]}"
    echo "[build-android] example:"
    echo "  export ANDROID_KEYSTORE_PATH=/abs/path/to/upload-keystore.jks"
    echo "  export ANDROID_KEYSTORE_PASSWORD=..."
    echo "  export ANDROID_KEY_ALIAS=upload"
    echo "  export ANDROID_KEY_PASSWORD=..."
    exit 1
  fi
}

release_signing_args() {
  local ks_path
  ks_path="$(cd "$(dirname "$ANDROID_KEYSTORE_PATH")" && pwd)/$(basename "$ANDROID_KEYSTORE_PATH")"
  printf '%s\n' \
    "-Pandroid.injected.signing.store.file=${ks_path}" \
    "-Pandroid.injected.signing.store.password=${ANDROID_KEYSTORE_PASSWORD}" \
    "-Pandroid.injected.signing.key.alias=${ANDROID_KEY_ALIAS}" \
    "-Pandroid.injected.signing.key.password=${ANDROID_KEY_PASSWORD}"
}

cd "$ROOT_DIR"

if [[ ! -d "android" ]]; then
  echo "[build-android] android project not found. Creating it with Capacitor..."
  npm run cap:add:android
fi

echo "[build-android] syncing Capacitor config..."
npm run cap:sync

cd android

case "$MODE" in
  debug)
    echo "[build-android] building debug APK..."
    ./gradlew assembleDebug
    echo "[build-android] output: android/app/build/outputs/apk/debug/app-debug.apk"
    ;;
  release-apk)
    ensure_release_signing_env
    echo "[build-android] building release APK..."
    mapfile -t signing_args < <(release_signing_args)
    ./gradlew assembleRelease "${signing_args[@]}"
    echo "[build-android] output: android/app/build/outputs/apk/release/app-release.apk"
    ;;
  release-aab)
    ensure_release_signing_env
    echo "[build-android] building release AAB..."
    mapfile -t signing_args < <(release_signing_args)
    ./gradlew bundleRelease "${signing_args[@]}"
    echo "[build-android] output: android/app/build/outputs/bundle/release/app-release.aab"
    ;;
  *)
    echo "Usage: bash scripts/build-android.sh [debug|release-apk|release-aab]"
    exit 1
    ;;
esac
