// Generates the notification chime assets under public/sounds/ as 16-bit
// mono WAVs. Self-contained (no external download / licensing) so they
// ship in the repo. Three tiers so staff can tell urgency by ear:
//   notification.wav - normal/low: soft two-note bell
//   high.wav         - high: crisper, brighter double-ding
//   urgent.wav       - urgent: insistent triple-beep alert
import { writeFileSync, mkdirSync } from "node:fs";

const SR = 44100;

// Render a list of notes into a Float32 buffer.
//   note = { f, start, len, gain, attack?, decay?, harmonics? }
//   harmonics: extra partials [{ mult, gain }] for timbre/edge
function render(dur, notes) {
  const n = Math.floor(SR * dur);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    for (const note of notes) {
      const rel = t - note.start;
      if (rel < 0 || rel > note.len) continue;
      const attack = Math.min(1, rel / (note.attack ?? 0.006));
      const decay = Math.exp(-rel * (note.decay ?? 6.5));
      const env = attack * decay * (note.gain ?? 0.5);
      s += env * Math.sin(2 * Math.PI * note.f * rel);
      for (const h of note.harmonics || []) {
        s += env * h.gain * Math.sin(2 * Math.PI * note.f * h.mult * rel);
      }
    }
    data[i] = s;
  }
  return data;
}

function writeWav(name, data) {
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  const norm = peak > 0 ? 0.84 / peak : 1;
  const n = data.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    let v = Math.round(data[i] * norm * 32767);
    v = Math.max(-32768, Math.min(32767, v));
    buf.writeInt16LE(v, 44 + i * 2);
  }
  mkdirSync("public/sounds", { recursive: true });
  writeFileSync(`public/sounds/${name}`, buf);
  console.log(`wrote public/sounds/${name} (${buf.length} bytes, ${(n / SR).toFixed(2)}s)`);
}

// --- normal/low: soft ascending two-note bell (A5 -> E6) ---
writeWav("notification.wav", render(0.55, [
  { f: 880.00,  start: 0.00, len: 0.30, gain: 0.55, harmonics: [{ mult: 2, gain: 0.18 }] },
  { f: 1318.51, start: 0.10, len: 0.45, gain: 0.60, harmonics: [{ mult: 2, gain: 0.18 }] },
]));

// --- high: brighter, snappier double-ding (C6 -> G6), faster decay ---
writeWav("high.wav", render(0.5, [
  { f: 1046.50, start: 0.00, len: 0.26, gain: 0.60, decay: 8, harmonics: [{ mult: 2, gain: 0.22 }, { mult: 3, gain: 0.08 }] },
  { f: 1567.98, start: 0.09, len: 0.40, gain: 0.65, decay: 8, harmonics: [{ mult: 2, gain: 0.22 }, { mult: 3, gain: 0.08 }] },
]));

// --- urgent: insistent triple beep, square-ish edge (B5), tight + repeated ---
const urgentHarm = [{ mult: 3, gain: 0.33 }, { mult: 5, gain: 0.2 }, { mult: 7, gain: 0.12 }]; // odd partials ~ square
writeWav("urgent.wav", render(0.62, [
  { f: 987.77, start: 0.00, len: 0.12, gain: 0.62, attack: 0.003, decay: 16, harmonics: urgentHarm },
  { f: 987.77, start: 0.17, len: 0.12, gain: 0.62, attack: 0.003, decay: 16, harmonics: urgentHarm },
  { f: 987.77, start: 0.34, len: 0.16, gain: 0.66, attack: 0.003, decay: 14, harmonics: urgentHarm },
]));
