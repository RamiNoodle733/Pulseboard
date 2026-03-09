let audioCtx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let droneGain: GainNode | null = null;
let droneStarted = false;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

export function resumeAudio(): void {
  const ctx = audioCtx;
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function getNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  if (noiseBuffer && noiseBuffer.duration >= duration) return noiseBuffer;
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBuffer = buffer;
  return buffer;
}

function ensureDrone(ctx: AudioContext): void {
  if (droneStarted) return;
  droneStarted = true;

  const bufferLen = Math.floor(ctx.sampleRate * 2);
  const droneBuffer = ctx.createBuffer(1, bufferLen, ctx.sampleRate);
  const data = droneBuffer.getChannelData(0);
  for (let i = 0; i < bufferLen; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = droneBuffer;
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 100;
  filter.Q.value = 2;

  droneGain = ctx.createGain();
  droneGain.gain.value = 0;

  source.connect(filter);
  filter.connect(droneGain);
  droneGain.connect(ctx.destination);
  source.start();
}

export function updateDroneLevel(energy: number, soundEnabled: boolean): void {
  if (!soundEnabled || !audioCtx || !droneGain) return;
  const target = Math.min(0.03, energy * 0.00003);
  droneGain.gain.setTargetAtTime(target, audioCtx.currentTime, 0.5);
}

/** Short dry click/pop — 40ms noise burst, velocity-scaled */
export function playPulseHit(soundEnabled: boolean, energy: number = 1): void {
  if (!soundEnabled) return;
  try {
    const ctx = getCtx();
    ensureDrone(ctx);
    const now = ctx.currentTime;
    const buffer = getNoiseBuffer(ctx, 0.05);

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2000 + energy * 1000;
    filter.Q.value = 1.0;

    const gain = ctx.createGain();
    const vol = 0.04 + energy * 0.06;
    gain.gain.setValueAtTime(Math.min(vol, 0.12), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(now);
    source.stop(now + 0.04);
  } catch { /* audio not available */ }
}

/** Satisfying thud + crack — two layered noise hits, louder at higher streaks */
export function playBurstHit(soundEnabled: boolean, streak: number): void {
  if (!soundEnabled) return;
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;
    const buffer = getNoiseBuffer(ctx, 0.12);
    const extra = Math.min(streak, 10);

    // Layer 1: low thud
    const thudSource = ctx.createBufferSource();
    thudSource.buffer = buffer;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 150;

    const thudGain = ctx.createGain();
    const thudVol = 0.1 + extra * 0.01;
    const thudDecay = 0.06 + extra * 0.005;
    thudGain.gain.setValueAtTime(Math.min(thudVol, 0.2), now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + thudDecay);

    thudSource.connect(lowpass);
    lowpass.connect(thudGain);
    thudGain.connect(ctx.destination);

    thudSource.start(now);
    thudSource.stop(now + thudDecay);

    // Layer 2: high crack
    const crackSource = ctx.createBufferSource();
    crackSource.buffer = buffer;

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 3000;

    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0.06, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    crackSource.connect(highpass);
    highpass.connect(crackGain);
    crackGain.connect(ctx.destination);

    crackSource.start(now);
    crackSource.stop(now + 0.03);
  } catch { /* audio not available */ }
}

/** One-shot event sound — subtle filtered burst */
export function playEventSound(soundEnabled: boolean, type: string): void {
  if (!soundEnabled) return;
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;
    const buffer = getNoiseBuffer(ctx, 0.2);

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = type === 'surge' ? 'lowpass' : type === 'resonance_wave' ? 'bandpass' : 'highpass';
    filter.frequency.value = type === 'surge' ? 200 : type === 'resonance_wave' ? 800 : 4000;
    filter.Q.value = 2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(now);
    source.stop(now + 0.15);
  } catch { /* audio not available */ }
}

export function haptic(pattern: number | number[]): void {
  if (navigator.vibrate) navigator.vibrate(pattern);
}
