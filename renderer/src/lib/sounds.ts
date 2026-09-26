// Sound utility for success/error feedback using Web Audio API
const audioCtx = typeof window !== 'undefined' ? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)() : null;

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  if (!audioCtx) return;
  // Resume context if suspended (autoplay policy)
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

export function playSuccess() {
  if (!audioCtx) return;
  // Pleasant two-tone chime
  playTone(523.25, 0.15, 'sine', 0.12); // C5
  setTimeout(() => playTone(659.25, 0.2, 'sine', 0.12), 120); // E5
  setTimeout(() => playTone(783.99, 0.3, 'sine', 0.1), 240); // G5
}

export function playError() {
  if (!audioCtx) return;
  playTone(200, 0.3, 'square', 0.08);
}

export function playCashRegister() {
  if (!audioCtx) return;
  // Cash register ka-ching
  playTone(1200, 0.08, 'sine', 0.1);
  setTimeout(() => playTone(1600, 0.08, 'sine', 0.1), 80);
  setTimeout(() => playTone(2000, 0.15, 'sine', 0.08), 160);
  setTimeout(() => playTone(2400, 0.25, 'sine', 0.06), 240);
}
