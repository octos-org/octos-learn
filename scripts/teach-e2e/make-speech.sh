#!/bin/sh
# Makes the fake-microphone clips the teach e2e scripts feed to Chromium
# (macOS `say` + `afconvert`): speech.wav (2 s silence, a sentence, 4 s
# silence) and speech-late.wav (25 s silence first, for writing before talking).
# Usage: scripts/teach-e2e/make-speech.sh <work-dir>
set -eu
dir="${1:?usage: make-speech.sh <work-dir>}"
mkdir -p "$dir"
say -v Samantha -o "$dir/speech.aiff" "Point A is at one comma two, and point B is at four comma eight."
afconvert -f WAVE -d LEI16@16000 -c 1 "$dir/speech.aiff" "$dir/speech-raw.wav"
python3 - "$dir" <<'PY'
import sys, wave
d = sys.argv[1]
src = wave.open(f"{d}/speech-raw.wav"); params = src.getparams(); frames = src.readframes(src.getnframes()); src.close()
second = b"\x00\x00" * 16000
for name, before, after in (("speech.wav", 2, 4), ("speech-late.wav", 25, 3)):
    out = wave.open(f"{d}/{name}", "w"); out.setparams(params); out.writeframes(second * before + frames + second * after); out.close()
PY
