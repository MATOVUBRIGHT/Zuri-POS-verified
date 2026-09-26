// Sound utility for success/error feedback using Web Audio API.
let audioCtx: AudioContext | null = null;
let hasUserGesture = false;
let listenersAttached = false;

const getAudioContextClass = () => {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
    null
  );
};

const ensureAudioContext = (): AudioContext | null => {
  if (!hasUserGesture) return null;
  if (audioCtx) return audioCtx;

  const AudioContextClass = getAudioContextClass();
  if (!AudioContextClass) return null;

  audioCtx = new AudioContextClass();
  return audioCtx;
};

const tryResume = async () => {
  const ctx = ensureAudioContext();
  if (!ctx || ctx.state !== "suspended") return;
  try {
    await ctx.resume();
  } catch {
    // Ignore browser policy failures; we'll retry on the next gesture.
  }
};

const ensureGestureListeners = () => {
  if (typeof window === "undefined" || listenersAttached) return;
  listenersAttached = true;

  const onGesture = () => {
    hasUserGesture = true;
    void tryResume();
  };

  window.addEventListener("pointerdown", onGesture, { once: false });
  window.addEventListener("keydown", onGesture, { once: false });
  window.addEventListener("touchstart", onGesture, { once: false });
};

function playTone(frequency: number, duration: number, type: OscillatorType = "sine", volume = 0.15) {
  ensureGestureListeners();
  const ctx = ensureAudioContext();
  if (!ctx) return;
  if (ctx.state !== "running") return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

// Attach listeners as soon as this module is loaded.
ensureGestureListeners();

export function playSuccess() {
  // Pleasant three-tone chime.
  playTone(523.25, 0.15, "sine", 0.12);
  setTimeout(() => playTone(659.25, 0.2, "sine", 0.12), 120);
  setTimeout(() => playTone(783.99, 0.3, "sine", 0.1), 240);
}

export function playError() {
  playTone(200, 0.3, "square", 0.08);
}

export function playCashRegister() {
  // Cash register ka-ching.
  playTone(1200, 0.08, "sine", 0.1);
  setTimeout(() => playTone(1600, 0.08, "sine", 0.1), 80);
  setTimeout(() => playTone(2000, 0.15, "sine", 0.08), 160);
  setTimeout(() => playTone(2400, 0.25, "sine", 0.06), 240);
}
