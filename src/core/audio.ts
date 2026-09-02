/** Procedural WebAudio: ambience layers and synthesized SFX. No audio files. */
export type SfxName =
  | 'pickup' | 'drop' | 'eat' | 'drink' | 'discover' | 'neuron' | 'unlock' | 'hit' | 'hurt' | 'dodge'
  | 'roar' | 'growl' | 'squeak' | 'snarl' | 'call' | 'jump' | 'land' | 'craft' | 'break' | 'fear'
  | 'heartbeat' | 'ui' | 'splash' | 'sleep' | 'death' | 'evolve' | 'light';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambGain: GainNode | null = null;
  private windNoise: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private rainGain: GainNode | null = null;
  private nightGain: GainNode | null = null;
  private heartbeatTimer = 0;
  private birdTimer = 0;
  private lastSfx = new Map<SfxName, number>();
  muted = false;
  volume = 0.7;

  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) return;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.ambGain = this.ctx.createGain();
    this.ambGain.gain.value = 0.35;
    this.ambGain.connect(this.master);
    this.buildAmbience();
  }

  resume() {
    this.ctx?.resume();
  }

  private noiseBuffer(seconds = 2): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
    }
    return buf;
  }

  private buildAmbience() {
    const ctx = this.ctx!;
    // Wind
    this.windNoise = ctx.createBufferSource();
    this.windNoise.buffer = this.noiseBuffer(3);
    this.windNoise.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 400;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.5;
    this.windNoise.connect(this.windFilter).connect(windGain).connect(this.ambGain!);
    this.windNoise.start();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(this.windFilter.frequency);
    lfo.start();
    // Rain
    const rain = ctx.createBufferSource();
    rain.buffer = this.noiseBuffer(2);
    rain.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 1800;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rain.connect(rainFilter).connect(this.rainGain).connect(this.ambGain!);
    rain.start();
    // Night crickets: modulated high tone
    const cricket = ctx.createOscillator();
    cricket.type = 'triangle';
    cricket.frequency.value = 4200;
    const cricketMod = ctx.createOscillator();
    cricketMod.frequency.value = 22;
    const cricketModGain = ctx.createGain();
    cricketModGain.gain.value = 0.5;
    this.nightGain = ctx.createGain();
    this.nightGain.gain.value = 0;
    cricketMod.connect(cricketModGain);
    const cricketAmp = ctx.createGain();
    cricketAmp.gain.value = 0.5;
    cricketModGain.connect(cricketAmp.gain);
    cricket.connect(cricketAmp).connect(this.nightGain).connect(this.ambGain!);
    cricket.start(); cricketMod.start();
  }

  /** Update ambience mix. */
  update(dt: number, opts: { night: number; rain: number; fear: number; inJungle: number; underwater: boolean; timeScale: number }) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, t, 0.1);
    this.rainGain?.gain.setTargetAtTime(opts.rain * 0.6, t, 0.5);
    this.nightGain?.gain.setTargetAtTime(opts.night * 0.06, t, 1);
    this.windFilter?.frequency.setTargetAtTime(opts.underwater ? 120 : 300 + opts.inJungle * 200, t, 0.5);
    // Heartbeat when afraid
    if (opts.fear > 55) {
      this.heartbeatTimer -= dt;
      if (this.heartbeatTimer <= 0) {
        this.heartbeatTimer = 1.1 - (opts.fear / 100) * 0.55;
        this.play('heartbeat', 0.2 + (opts.fear / 100) * 0.5);
      }
    }
    // Random birds during day in jungle
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 4 + Math.random() * 10;
      if (opts.night < 0.5 && Math.random() < 0.3 + opts.inJungle * 0.5) this.bird();
    }
  }

  private bird() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    const t = ctx.currentTime;
    const base = 1800 + Math.random() * 1500;
    o.frequency.setValueAtTime(base, t);
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      o.frequency.exponentialRampToValueAtTime(base * (1 + Math.random() * 0.4), t + i * 0.12 + 0.06);
      o.frequency.exponentialRampToValueAtTime(base, t + i * 0.12 + 0.12);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.02);
    g.gain.linearRampToValueAtTime(0, t + n * 0.12 + 0.05);
    o.connect(g).connect(this.ambGain!);
    o.start(t); o.stop(t + n * 0.12 + 0.1);
  }

  play(name: SfxName, volume = 1, pan = 0) {
    if (!this.ctx || !this.master || this.muted) return;
    const now = performance.now();
    const last = this.lastSfx.get(name) ?? 0;
    if (now - last < 40) return;
    this.lastSfx.set(name, now);
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = volume;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(panner).connect(this.master);

    const tone = (type: OscillatorType, f0: number, f1: number, dur: number, g0 = 0.3, curve: 'exp' | 'lin' = 'exp') => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      else o.frequency.linearRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(g0, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + dur + 0.02);
    };
    const noise = (dur: number, freq: number, g0 = 0.3, type: BiquadFilterType = 'bandpass') => {
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuffer(Math.max(0.1, dur));
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(g0, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f).connect(g).connect(out);
      s.start(t); s.stop(t + dur + 0.02);
    };

    switch (name) {
      case 'pickup': tone('sine', 520, 880, 0.12, 0.25); break;
      case 'drop': noise(0.15, 300, 0.4, 'lowpass'); break;
      case 'eat': noise(0.25, 900, 0.5); tone('sine', 180, 120, 0.2, 0.15); break;
      case 'drink': noise(0.5, 1200, 0.3); tone('sine', 400, 700, 0.3, 0.08); break;
      case 'discover': tone('sine', 660, 990, 0.35, 0.25); tone('sine', 880, 1320, 0.5, 0.15); break;
      case 'neuron': tone('triangle', 900, 1400, 0.25, 0.15); break;
      case 'unlock': tone('sine', 440, 880, 0.4, 0.3); tone('sine', 660, 1320, 0.6, 0.2); tone('triangle', 220, 440, 0.8, 0.1); break;
      case 'hit': noise(0.12, 400, 0.6, 'lowpass'); tone('square', 120, 60, 0.12, 0.3); break;
      case 'hurt': tone('sawtooth', 300, 100, 0.35, 0.35); noise(0.3, 600, 0.3); break;
      case 'dodge': noise(0.2, 2500, 0.3, 'highpass'); break;
      case 'roar': tone('sawtooth', 110, 70, 1.2, 0.5); noise(1.0, 250, 0.6, 'lowpass'); tone('square', 80, 55, 1.0, 0.2); break;
      case 'growl': tone('sawtooth', 90, 60, 0.8, 0.35); noise(0.8, 180, 0.35, 'lowpass'); break;
      case 'snarl': tone('sawtooth', 220, 140, 0.4, 0.35); noise(0.4, 900, 0.4); break;
      case 'squeak': tone('sine', 2200, 3200, 0.1, 0.15); break;
      case 'call': tone('square', 330, 520, 0.25, 0.2); tone('square', 520, 330, 0.3, 0.2); break;
      case 'jump': noise(0.12, 800, 0.2); break;
      case 'land': noise(0.15, 250, 0.5, 'lowpass'); break;
      case 'craft': noise(0.1, 2000, 0.6); tone('square', 900, 600, 0.08, 0.2); break;
      case 'break': noise(0.3, 1500, 0.7); tone('square', 400, 100, 0.2, 0.3); break;
      case 'fear': tone('sine', 60, 40, 1.5, 0.4); break;
      case 'heartbeat': tone('sine', 70, 45, 0.18, 0.5); break;
      case 'ui': tone('sine', 700, 900, 0.06, 0.12); break;
      case 'splash': noise(0.5, 900, 0.5); tone('sine', 300, 120, 0.3, 0.1); break;
      case 'sleep': tone('sine', 300, 150, 1.5, 0.15); break;
      case 'death': tone('sawtooth', 200, 40, 2.0, 0.4); noise(1.5, 200, 0.3, 'lowpass'); break;
      case 'evolve': tone('sine', 220, 880, 2.5, 0.3); tone('sine', 330, 1320, 2.5, 0.2); tone('triangle', 110, 440, 3, 0.15); break;
      case 'light': tone('sine', 1200, 1800, 0.3, 0.2); tone('sine', 1800, 2400, 0.5, 0.1); break;
    }
  }
}
