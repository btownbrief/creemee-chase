const KEY = 'creemee-chase-muted';
let context = null;
let muted = localStorage.getItem(KEY) === '1';

function tone(frequency, delay = 0, duration = 0.12, type = 'sine', gain = 0.12) {
  if (muted) return;
  context ||= new (window.AudioContext || window.webkitAudioContext)();
  if (context.state === 'suspended') context.resume();
  const at = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const volume = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);
  volume.gain.setValueAtTime(0.001, at);
  volume.gain.exponentialRampToValueAtTime(gain, at + 0.015);
  volume.gain.exponentialRampToValueAtTime(0.001, at + duration);
  oscillator.connect(volume).connect(context.destination);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.03);
}

export const sound = {
  get muted() { return muted; },
  toggle() {
    muted = !muted;
    localStorage.setItem(KEY, muted ? '1' : '0');
    return muted;
  },
  roll(value) { tone(150 + value * 18, 0, 0.09, 'square', 0.05); tone(110, 0.08, 0.08, 'triangle', 0.08); },
  move() { tone(330, 0, 0.08, 'triangle', 0.09); },
  bump() { tone(180, 0, 0.18, 'sawtooth', 0.08); tone(95, 0.08, 0.22, 'triangle', 0.1); },
  finish() { [523, 659, 784].forEach((note, i) => tone(note, i * 0.1, 0.24, 'triangle', 0.11)); },
  win() { [392, 523, 659, 784].forEach((note, i) => tone(note, i * 0.12, 0.3, 'triangle', 0.14)); },
};
