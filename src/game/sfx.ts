type SoundName =
  | 'shoot' | 'snipe' | 'frost' | 'zap' | 'boom' | 'leak' | 'coin'
  | 'place' | 'upgrade' | 'sell' | 'error' | 'wave' | 'win' | 'lose'
  | 'flame' | 'missile' | 'ability' | 'cloak' | 'heart' | 'horn' | 'firework' | 'thunder';

type MusicMode = 'off' | 'calm' | 'combat';

interface MusicNodes {
  master: GainNode;
  pad: GainNode;
  bass: GainNode;
  filter: BiquadFilterNode;
  oscs: OscillatorNode[];
  lfo?: OscillatorNode;
  lfoGain?: GainNode;
  pulse?: OscillatorNode;
  pulseGain?: GainNode;
}

export class Sfx {
  muted = false;
  private ac: AudioContext | null = null;
  private last = new Map<SoundName, number>();
  private windGain: GainNode | null = null;
  private ambT = 0;

  private ensure(): AudioContext | null {
    try {
      if (!this.ac) this.ac = new AudioContext();
      if (this.ac.state === 'suspended') void this.ac.resume();
      return this.ac;
    } catch {
      return null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.windGain && this.ac) {
      this.windGain.gain.setTargetAtTime(m ? 0 : 0.05, this.ac.currentTime, 0.2);
    }
    if (this.music && this.ac) {
      this.music.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ac.currentTime, 0.2);
    }
  }

  setMusic(mode: MusicMode) {
    if (this.musicMode === mode) return;
    this.musicMode = mode;
    const ac = this.ensure();
    if (!ac) return;
    if (!this.music) this.music = this.buildMusic(ac);
    const m = this.music;
    const t = ac.currentTime;
    if (mode === 'off') {
      m.master.gain.setTargetAtTime(0, t, 0.6);
      return;
    }
    m.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, t, 0.5);
    if (mode === 'calm') {
      m.pad.gain.setTargetAtTime(0.05, t, 1.2);
      m.bass.gain.setTargetAtTime(0.0, t, 0.8);
      m.filter.frequency.setTargetAtTime(520, t, 1.5);
    } else {
      m.pad.gain.setTargetAtTime(0.075, t, 0.8);
      m.bass.gain.setTargetAtTime(0.05, t, 0.8);
      m.filter.frequency.setTargetAtTime(1250, t, 0.8);
    }
  }

  private music: MusicNodes | null = null;
  private musicMode: MusicMode = 'off';

  private buildMusic(ac: AudioContext): MusicNodes {
    const master = ac.createGain();
    master.gain.value = 0;
    master.connect(ac.destination);

    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.6;
    filter.connect(master);

    const pad = ac.createGain();
    pad.gain.value = 0;
    pad.connect(filter);

    const oscs: OscillatorNode[] = [];
    const freqs = [110, 164.81, 220, 246.94];
    for (const f of freqs) {
      for (const det of [-4, 4]) {
        const o = ac.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        o.detune.value = det;
        const g = ac.createGain();
        g.gain.value = 0.25;
        o.connect(g);
        g.connect(pad);
        o.start();
        oscs.push(o);
      }
    }
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    const bass = ac.createGain();
    bass.gain.value = 0;
    bass.connect(master);
    const pulse = ac.createOscillator();
    pulse.type = 'square';
    pulse.frequency.value = 55;
    const pulseGain = ac.createGain();
    pulseGain.gain.value = 0.25;
    const pulseLfo = ac.createOscillator();
    pulseLfo.type = 'square';
    pulseLfo.frequency.value = 2.2;
    const pulseLfoGain = ac.createGain();
    pulseLfoGain.gain.value = 0.25;
    pulseLfo.connect(pulseLfoGain);
    pulseLfoGain.connect(pulseGain.gain);
    pulse.connect(pulseGain);
    pulseGain.connect(bass);
    pulse.start();
    pulseLfo.start();

    return { master, pad, bass, filter, oscs, lfo, lfoGain, pulse, pulseGain };
  }

  ambience(daylight: number, dt: number) {
    if (this.muted) return;
    const ac = this.ensure();
    if (!ac) return;
    if (!this.windGain) {
      this.startWind(ac);
    }
    this.ambT -= dt;
    if (this.ambT > 0) return;
    this.ambT = 0.5 + Math.random() * 0.9;
    const r = Math.random();
    if (daylight > 0.6 && r < 0.18) this.bird(ac);
    else if (daylight < 0.25 && r < 0.28) this.cricket(ac);
  }

  private startWind(ac: AudioContext) {
    const len = Math.floor(ac.sampleRate * 3);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.5;
      }
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 480;
    const g = ac.createGain();
    g.gain.value = this.muted ? 0 : 0.05;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.09;
    const lg = ac.createGain();
    lg.gain.value = 0.02;
    lfo.connect(lg);
    lg.connect(g.gain);
    src.connect(f);
    f.connect(g);
    g.connect(ac.destination);
    src.start();
    lfo.start();
    this.windGain = g;
  }

  setRain(amount: number) {
    if (!this.rainGain && amount <= 0) return;
    const ac = this.ensure();
    if (!ac) return;
    if (!this.rainGain) {
      const len = Math.floor(ac.sampleRate * 2);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1600;
      f.Q.value = 0.4;
      const g = ac.createGain();
      g.gain.value = 0;
      src.connect(f);
      f.connect(g);
      g.connect(ac.destination);
      src.start();
      this.rainGain = g;
    }
    this.rainGain.gain.setTargetAtTime(this.muted ? 0 : 0.085 * amount, ac.currentTime, 0.5);
  }

  private rainGain: GainNode | null = null;

  private bird(ac: AudioContext) {
    const t = ac.currentTime;
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      this.tone(ac, t + i * 0.13, 2400 + Math.random() * 1100, 0.07, 'sine', 0.012, -700);
    }
  }

  private cricket(ac: AudioContext) {
    const t = ac.currentTime;
    for (let i = 0; i < 5; i++) {
      this.tone(ac, t + i * 0.055, 4200, 0.028, 'triangle', 0.008, 0);
    }
  }

  play(name: SoundName) {
    if (this.muted) return;
    const now = performance.now();
    const min = name === 'shoot' ? 90 : 55;
    if (now - (this.last.get(name) ?? 0) < min) return;
    this.last.set(name, now);
    const ac = this.ensure();
    if (!ac) return;
    const t = ac.currentTime;
    switch (name) {
      case 'shoot': this.tone(ac, t, 520, 0.05, 'square', 0.035, -180); break;
      case 'snipe': this.tone(ac, t, 900, 0.08, 'sawtooth', 0.05, -500); break;
      case 'frost': this.tone(ac, t, 1300, 0.1, 'sine', 0.03, 300); break;
      case 'zap': this.tone(ac, t, 240, 0.12, 'sawtooth', 0.045, 700); break;
      case 'boom': this.noise(ac, t, 0.25, 0.12, 900); break;
      case 'leak': this.tone(ac, t, 160, 0.3, 'square', 0.06, -60); break;
      case 'coin': this.tone(ac, t, 880, 0.06, 'sine', 0.04, 0); this.tone(ac, t + 0.07, 1320, 0.09, 'sine', 0.04, 0); break;
      case 'place': this.tone(ac, t, 300, 0.08, 'triangle', 0.06, 200); break;
      case 'upgrade': this.tone(ac, t, 440, 0.09, 'triangle', 0.05, 220); this.tone(ac, t + 0.09, 660, 0.12, 'triangle', 0.05, 0); break;
      case 'sell': this.tone(ac, t, 500, 0.12, 'triangle', 0.05, -200); break;
      case 'error': this.tone(ac, t, 140, 0.12, 'square', 0.05, 0); break;
      case 'wave': this.tone(ac, t, 440, 0.15, 'triangle', 0.05, 220); break;
      case 'win': this.tone(ac, t, 523, 0.15, 'triangle', 0.06, 0); this.tone(ac, t + 0.16, 659, 0.15, 'triangle', 0.06, 0); this.tone(ac, t + 0.32, 784, 0.3, 'triangle', 0.06, 0); break;
      case 'lose': this.tone(ac, t, 330, 0.25, 'sawtooth', 0.05, -120); this.tone(ac, t + 0.26, 220, 0.4, 'sawtooth', 0.05, -100); break;
      case 'flame': this.noise(ac, t, 0.12, 0.045, 500); break;
      case 'missile': this.noise(ac, t, 0.18, 0.05, 1600); break;
      case 'ability': this.tone(ac, t, 700, 0.2, 'triangle', 0.05, 250); break;
      case 'cloak': this.tone(ac, t, 620, 0.25, 'sine', 0.04, -420); break;
      case 'heart': this.tone(ac, t, 58, 0.1, 'sine', 0.16, -8); this.tone(ac, t + 0.16, 52, 0.12, 'sine', 0.12, -6); break;
      case 'horn':
        this.tone(ac, t, 92, 0.9, 'sawtooth', 0.09, -18);
        this.tone(ac, t + 0.02, 138, 0.9, 'sawtooth', 0.06, -22);
        this.noise(ac, t, 0.5, 0.03, 300);
        break;
      case 'firework':
        this.noise(ac, t, 0.22, 0.07, 1200);
        this.tone(ac, t + 0.05, 1500 + Math.random() * 900, 0.18, 'sine', 0.03, -900);
        break;
      case 'thunder':
        this.noise(ac, t, 1.4, 0.15, 240);
        this.noise(ac, t + 0.35, 1.1, 0.08, 130);
        break;
    }
  }

  private tone(ac: AudioContext, t: number, freq: number, dur: number, type: OscillatorType, vol: number, slide: number) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.linearRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(ac.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(ac: AudioContext, t: number, dur: number, vol: number, cutoff: number) {
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(ac.destination);
    src.start(t);
  }
}
