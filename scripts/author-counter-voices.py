"""Author the shop dialogue and lip timings with local Kokoro-82M v1.0.

Run from the repository root with Kokoro 0.9.4, misaki[en], soundfile, Node,
and ffmpeg installed. Audio is published in data/art/counter-voices.
"""
import io
import json
import subprocess
from pathlib import Path

import soundfile
import torch
from kokoro import KPipeline

LINES = ("greeting", "familiar", "reply", "ordered", "ready")
VOICES = {"chemist": "am_michael", "lunch": "af_sarah"}
PHONEMES = {
    "open": "aAæɑɐəʌɜɚɝ",
    "round": "oOɔɒʊuɹwʷW",
    "wide": "eEiIɛɪijyY",
    "closed": "mpbfv",
}
SHAPES = {phoneme: shape for shape, phonemes in PHONEMES.items() for phoneme in phonemes}


def align(result):
    frames = result.pred_dur.tolist()
    if len(frames) != len(result.phonemes) + 2:
        raise ValueError(f"Phonemes and frames disagree for {result.graphemes}")
    at = max(0, frames[0] - 3)
    shapes = []
    for phoneme, length in zip(result.phonemes, frames[1:-1]):
        start, end = round(at / 40, 3), round((at + length) / 40, 3)
        at += length
        shape = SHAPES.get(phoneme, "rest")
        if shapes and shapes[-1][2] == shape:
            shapes[-1][1] = end
        elif end > start:
            shapes.append([start, end, shape])
    return shapes


def main():
    menus = json.loads(subprocess.check_output(["node", "--input-type=module", "-e",
        "import {SHOP_MENUS} from './src/gameplay/shop-state.mjs'; console.log(JSON.stringify(SHOP_MENUS));"]))
    torch.set_num_threads(2)
    pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M", device="cpu")
    output = Path("data/art/counter-voices")
    output.mkdir(exist_ok=True)
    manifest = {}
    for kind, voice in VOICES.items():
        manifest[kind] = {}
        for line in LINES:
            chunks = list(pipeline(menus[kind][line].replace("’", "'"), voice=voice, speed=.96))
            cues, seconds = [], 0
            samples = []
            for chunk in chunks:
                if chunk.audio is None:
                    raise RuntimeError(f"No audio for {kind}/{line}")
                first = next(token.start_ts for token in chunk.tokens if token.start_ts is not None)
                lead = min(.35, max(0, first - .12))
                audio = chunk.audio[round(lead * 24000):]
                for start, end, shape in align(chunk):
                    if end > lead:
                        cues.append([round(seconds + max(0, start - lead), 3),
                                     round(seconds + end - lead, 3), shape])
                samples.append(audio)
                seconds += len(audio) / 24000
            wave = io.BytesIO()
            soundfile.write(wave, torch.cat(samples).numpy(), 24000, format="WAV")
            subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
                "-af", "loudnorm=I=-20:TP=-2:LRA=7", "-ar", "24000", "-ac", "1",
                "-b:a", "64k", str(output / f"{kind}-{line}.mp3")], input=wave.getvalue(), check=True)
            manifest[kind][line] = {"duration": round(seconds, 3), "cues": cues}
            print(f"{kind}/{line}: {seconds:.2f}s, {len(cues)} cues", flush=True)
    (output / "lip-timings.json").write_text(json.dumps(manifest, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
