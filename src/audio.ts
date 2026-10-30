// Chiptune audio, generated live with the Web Audio API (no sound files).
// Browsers only allow sound after a tap or key press, so nothing plays until then.
import { soundOn, onSound } from './ui';

let ctx: AudioContext | null = null;
let master: GainNode, musicBus: GainNode, sfxBus: GainNode;
let noise: AudioBuffer;
let wantMusic = false;
let musicTimer = 0;

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const n = (s: string) => 12 * (Number(s.slice(-1)) + 1) + NOTE[s[0]] + (s[1] === '#' ? 1 : 0);

function setup() {
  if (ctx) return ctx;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = soundOn() ? 1 : 0;
  master.connect(ctx.destination);
  musicBus = ctx.createGain(); musicBus.gain.value = 0.07; musicBus.connect(master);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.16; sfxBus.connect(master);
  noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

// One chip voice: an oscillator with a quick attack and decay.
function tone(bus: GainNode, type: OscillatorType, freq: number, at: number, dur: number, vol = 1, slideTo?: number) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  o.connect(g).connect(bus);
  o.start(at); o.stop(at + dur + 0.02);
}

function hiss(bus: GainNode, at: number, dur: number, vol = 1, hp = 6000) {
  if (!ctx) return;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise;
  f.type = 'highpass'; f.frequency.value = hp;
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  s.connect(f).connect(g).connect(bus);
  s.start(at); s.stop(at + dur + 0.02);
}

// ---------- the theme: 8 bars, C - Am - F - G, eighth notes at 132 bpm ----------
const LEAD = [
  'E5 . G5 . C6 . G5 E5', 'F5 . E5 . D5 . C5 .', 'C5 . E5 . A5 . G5 E5', 'G5 . F5 . E5 . . .',
  'A5 . C6 . A5 . F5 A5', 'G5 . B5 . D6 . B5 G5', 'E5 G5 C6 . B5 . G5 .', 'F5 . D5 . B4 . . .',
].join(' ').split(' ');
const BASS = ['C3', 'C3', 'A2', 'A2', 'F2', 'G2', 'C3', 'G2'];
const EIGHTH = 60 / 132 / 2;

let step = 0, nextAt = 0;
function scheduleMusic() {
  if (!ctx || !wantMusic) return;
  while (nextAt < ctx.currentTime + 0.2) {
    const s = step % LEAD.length, bar = Math.floor(s / 8), beat = s % 8;
    if (LEAD[s] !== '.') tone(musicBus, 'square', midi(n(LEAD[s])), nextAt, EIGHTH * 1.6, 0.9);
    if (beat % 4 === 0) tone(musicBus, 'triangle', midi(n(BASS[bar])), nextAt, EIGHTH * 3.5, 1.6);
    if (beat % 2 === 1) hiss(musicBus, nextAt, 0.04, 0.5);
    nextAt += EIGHTH;
    step++;
  }
}

export function startMusic() {
  wantMusic = true;
  if (!ctx || musicTimer) return;
  nextAt = ctx.currentTime + 0.1;
  musicTimer = window.setInterval(scheduleMusic, 50);
}

// ---------- sound effects ----------
export type Sfx = 'flap' | 'send' | 'blip' | 'arrive' | 'loss' | 'splash' | 'click' | 'untie';
export function sfx(name: Sfx) {
  if (!ctx || !soundOn()) return;
  const t = ctx.currentTime + 0.01;
  switch (name) {
    case 'flap': hiss(sfxBus, t, 0.07, 0.7, 1500); tone(sfxBus, 'square', 220, t, 0.05, 0.25, 140); break;
    case 'click': tone(sfxBus, 'square', 660, t, 0.04, 0.4); break;
    case 'blip': tone(sfxBus, 'square', 880 + Math.random() * 120, t, 0.03, 0.25); break;
    case 'send': ['C5', 'E5', 'G5', 'C6', 'E6'].forEach((s, i) => tone(sfxBus, 'square', midi(n(s)), t + i * 0.06, 0.12, 0.6)); break;
    case 'arrive': ['G5', 'C6', 'E6', 'G6'].forEach((s, i) => tone(sfxBus, 'square', midi(n(s)), t + i * 0.1, i === 3 ? 0.5 : 0.14, 0.6)); break;
    case 'loss': ['G4', 'F#4', 'F4', 'E4'].forEach((s, i) => tone(sfxBus, 'triangle', midi(n(s)), t + i * 0.28, i === 3 ? 0.7 : 0.26, 1.4, i === 3 ? midi(n('D4')) : undefined)); break;
    case 'splash': hiss(sfxBus, t, 0.35, 0.9, 800); break;
    case 'untie': hiss(sfxBus, t, 0.18, 0.5, 2400); ['E6', 'C6', 'G5'].forEach((s, i) => tone(sfxBus, 'square', midi(n(s)), t + 0.05 + i * 0.07, 0.08, 0.35)); hiss(sfxBus, t + 0.45, 0.4, 0.45, 1200); break;
  }
}

// ---------- unlocking, muting, background tabs ----------
// iPhones only let sound start when a finger lifts (touchend/click), not on pointerdown, so every
// gesture retries until the context is actually running. 'playback' lets it play with the silent switch on.
let unlocked = false;
const GESTURES = ['pointerup', 'touchend', 'click', 'keydown'];
function unlock() {
  if (unlocked) return;
  const c = setup();
  if (!c) return;
  try { (navigator as unknown as { audioSession?: { type: string } }).audioSession!.type = 'playback'; } catch { /* not Safari */ }
  const blip = c.createBufferSource(); blip.buffer = c.createBuffer(1, 1, 22050); blip.connect(c.destination); blip.start(0); // older iOS needs a sound in the gesture
  c.resume().then(() => {
    if (unlocked || c.state !== 'running') return;
    unlocked = true;
    for (const ev of GESTURES) removeEventListener(ev, unlock, true);
    if (wantMusic) { wantMusic = false; startMusic(); }
  }).catch(() => { /* try again on the next tap */ });
}

// Pages call this once: music starts with the first tap or key press (if sound is on).
export function initAudio(opts: { music?: boolean } = {}) {
  if (opts.music) wantMusic = true;
  for (const ev of GESTURES) addEventListener(ev, unlock, { capture: true });
  onSound(on => {
    if (on && !ctx) unlock();
    if (master && ctx) master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.02);
  });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else if (unlocked) ctx.resume();
  });
}

// For debugging: "running" once the first tap has unlocked sound.
export const audioState = () => ctx?.state ?? "locked";
if (import.meta.env.DEV) (window as unknown as { __audio: () => string }).__audio = audioState; // dev-only check
