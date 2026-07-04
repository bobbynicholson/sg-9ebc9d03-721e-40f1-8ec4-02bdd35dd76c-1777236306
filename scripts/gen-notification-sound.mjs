// Generates a short, pleasant two-note notification chime as a 16-bit mono
// WAV at public/sounds/notification.wav. Self-contained (no external
// download / licensing) so it can ship in the repo.
import { writeFileSync, mkdirSync } from "node:fs";

const SR = 44100;
const dur = 0.55;            // seconds
const n = Math.floor(SR * dur);
const data = new Float32Array(n);

// Two ascending bell-like notes (A5 -> E6) with exponential decay, a soft
// attack, and a faint octave harmonic for warmth.
const notes = [
  { f: 880.0,   start: 0.00, len: 0.30, gain: 0.55 }, // A5
  { f: 1318.51, start: 0.10, len: 0.45, gain: 0.60 }, // E6
];
for (let i = 0; i < n; i++) {
  const t = i / SR;
  let s = 0;
  for (const note of notes) {
    const rel = t - note.start;
    if (rel < 0 || rel > note.len) continue;
    const attack = Math.min(1, rel / 0.006);          // 6ms fade-in (no click)
    const decay = Math.exp(-rel * 6.5);                // smooth ring-out
    const env = attack * decay * note.gain;
    s += env * Math.sin(2 * Math.PI * note.f * rel);
    s += env * 0.18 * Math.sin(2 * Math.PI * note.f * 2 * rel); // octave shimmer
  }
  data[i] = s;
}
// Normalise to -1.5 dBFS headroom.
let peak = 0;
for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(data[i]));
const norm = peak > 0 ? 0.84 / peak : 1;

// 16-bit PCM WAV.
const bytesPerSample = 2;
const buf = Buffer.alloc(44 + n * bytesPerSample);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + n * bytesPerSample, 4);
buf.write("WAVE", 8);
buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);            // PCM
buf.writeUInt16LE(1, 22);            // mono
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * bytesPerSample, 28);
buf.writeUInt16LE(bytesPerSample, 32);
buf.writeUInt16LE(16, 34);
buf.write("data", 36);
buf.writeUInt32LE(n * bytesPerSample, 40);
for (let i = 0; i < n; i++) {
  let v = Math.round(data[i] * norm * 32767);
  v = Math.max(-32768, Math.min(32767, v));
  buf.writeInt16LE(v, 44 + i * bytesPerSample);
}

mkdirSync("public/sounds", { recursive: true });
writeFileSync("public/sounds/notification.wav", buf);
console.log(`wrote public/sounds/notification.wav (${buf.length} bytes, ${dur}s)`);
