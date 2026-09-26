// Printer connection sound effects.
let audioContext: AudioContext | null = null;
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
  if (audioContext) return audioContext;

  const AudioContextClass = getAudioContextClass();
  if (!AudioContextClass) return null;

  audioContext = new AudioContextClass();
  return audioContext;
};

const ensureGestureListeners = () => {
  if (typeof window === "undefined" || listenersAttached) return;
  listenersAttached = true;

  const onGesture = async () => {
    hasUserGesture = true;
    const ctx = ensureAudioContext();
    if (ctx && ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // Browser may still block this without a valid gesture context.
      }
    }
  };

  window.addEventListener("pointerdown", onGesture, { once: false });
  window.addEventListener("keydown", onGesture, { once: false });
  window.addEventListener("touchstart", onGesture, { once: false });
};

const withAudio = (fn: (ctx: AudioContext) => void) => {
  ensureGestureListeners();
  const ctx = ensureAudioContext();
  if (!ctx || ctx.state !== "running") return;
  fn(ctx);
};

ensureGestureListeners();

// Play connected sound (ascending beep)
export const playPrinterConnected = () => {
  withAudio((ctx) => {
    try {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
    
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
    
      oscillator.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      oscillator.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
      oscillator.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
    
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.4);
    } catch (error) {
      console.error("Error playing connected sound:", error);
    }
  });
};

// Play disconnected sound (descending beep)
export const playPrinterDisconnected = () => {
  withAudio((ctx) => {
    try {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
    
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
    
      oscillator.frequency.setValueAtTime(783.99, ctx.currentTime); // G5
      oscillator.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
      oscillator.frequency.setValueAtTime(523.25, ctx.currentTime + 0.2); // C5
    
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.4);
    } catch (error) {
      console.error("Error playing disconnected sound:", error);
    }
  });
};

// Play print success sound (quick double beep)
export const playPrintSuccess = () => {
  withAudio((ctx) => {
    try {
      const oscillator1 = ctx.createOscillator();
      const oscillator2 = ctx.createOscillator();
      const gainNode = ctx.createGain();
    
      oscillator1.connect(gainNode);
      oscillator2.connect(gainNode);
      gainNode.connect(ctx.destination);
    
      oscillator1.frequency.setValueAtTime(880, ctx.currentTime); // A5
      oscillator2.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
    
      gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    
      oscillator1.start(ctx.currentTime);
      oscillator1.stop(ctx.currentTime + 0.1);
    
      oscillator2.start(ctx.currentTime + 0.15);
      oscillator2.stop(ctx.currentTime + 0.25);
    } catch (error) {
      console.error("Error playing print success sound:", error);
    }
  });
};

// Play print error sound (low buzz)
export const playPrintError = () => {
  withAudio((ctx) => {
    try {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
    
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
    
      oscillator.frequency.setValueAtTime(200, ctx.currentTime);
      oscillator.type = "sawtooth";
    
      gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch (error) {
      console.error("Error playing print error sound:", error);
    }
  });
};
