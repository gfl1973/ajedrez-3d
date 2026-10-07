/**
 * Sonido sintetizado con WebAudio: golpes de madera, capturas, jaques,
 * campanas de victoria y una música ambiente suave. Sin archivos de audio.
 */
export class SoundFX {
  constructor() {
    this.enabled = true;
    this.musicOn = true;
    this.volume = 0.8;
    this.ctx = null;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      // reverberación sintética para dar espacio
      this.verb = this.ctx.createConvolver();
      this.verb.buffer = this.impulse(2.4, 2.8);
      this.verbGain = this.ctx.createGain();
      this.verbGain.gain.value = 0.22;
      this.verb.connect(this.verbGain).connect(this.master);
      this.master.connect(this.ctx.destination);
      this.fx = this.ctx.createGain();
      this.fx.connect(this.master);
      this.fx.connect(this.verb);
      this.noiseBuf = this.makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  impulse(seconds, decay) {
    const rate = this.ctx.sampleRate, len = rate * seconds;
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setEnabled(on) { this.enabled = on; if (!on) this.stopMusic(); else if (this.musicOn) this.startMusic(); }
  setMusic(on) { this.musicOn = on; if (on && this.enabled) this.startMusic(); else this.stopMusic(); }

  // --- primitivas ---
  tone(freq, { type = 'sine', t = 0, dur = 0.3, gain = 0.3, attack = 0.005, slideTo = null, dest = null } = {}) {
    const c = this.ctx, now = c.currentTime + t;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, now);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(dest || this.fx);
    o.start(now); o.stop(now + dur + 0.05);
  }

  noise({ t = 0, dur = 0.05, gain = 0.3, freq = 2000, q = 1.5, type = 'bandpass' } = {}) {
    const c = this.ctx, now = c.currentTime + t;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    s.connect(f).connect(g).connect(this.fx);
    s.start(now, Math.random() * 0.3); s.stop(now + dur + 0.02);
  }

  /** Golpe de pieza de madera sobre el tablero. */
  knock(t = 0, weight = 1) {
    this.tone(150 * (0.9 + Math.random() * 0.2), { t, dur: 0.16, gain: 0.5 * weight, slideTo: 70 });
    this.tone(420 * (0.95 + Math.random() * 0.1), { t, dur: 0.06, gain: 0.12 * weight, type: 'triangle', slideTo: 260 });
    this.noise({ t, dur: 0.035, gain: 0.35 * weight, freq: 2600, q: 1.2 });
  }

  play(name) {
    if (!this.enabled || !this.ensure()) return;
    switch (name) {
      case 'move': this.knock(); break;
      case 'capture':
        this.knock(0, 1.15); this.knock(0.05, 0.7);
        this.noise({ t: 0, dur: 0.12, gain: 0.18, freq: 5200, q: 0.8 });
        break;
      case 'castle': this.knock(0); this.knock(0.14, 0.85); break;
      case 'check':
        this.knock();
        this.tone(988, { t: 0.04, dur: 0.9, gain: 0.12 }); this.tone(1480, { t: 0.04, dur: 0.7, gain: 0.06 });
        break;
      case 'promote':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, { t: i * 0.07, dur: 0.6, gain: 0.12, type: 'triangle' }));
        break;
      case 'select': this.tone(1320, { dur: 0.08, gain: 0.05, type: 'sine' }); break;
      case 'illegal': this.tone(140, { dur: 0.16, gain: 0.12, type: 'square', slideTo: 110 }); break;
      case 'hover': this.tone(2200, { dur: 0.04, gain: 0.018 }); break;
      case 'click': this.tone(880, { dur: 0.09, gain: 0.07, type: 'triangle', slideTo: 1320 }); break;
      case 'start':
        [392, 523, 659, 784].forEach((f, i) => this.tone(f, { t: i * 0.09, dur: 1.4, gain: 0.07, type: 'sine', attack: 0.04 }));
        break;
      case 'drop': this.knock(0, 0.35); break;
      case 'win':
        [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => { this.tone(f, { t: i * 0.11, dur: 1.6, gain: 0.1, type: 'triangle' }); this.tone(f * 2, { t: i * 0.11, dur: 0.8, gain: 0.03 }); });
        break;
      case 'lose':
        [440, 392, 349, 262].forEach((f, i) => this.tone(f, { t: i * 0.22, dur: 1.2, gain: 0.09, type: 'sine', attack: 0.03 }));
        break;
      case 'draw':
        [523, 659].forEach((f, i) => this.tone(f, { t: i * 0.25, dur: 1.2, gain: 0.08, type: 'sine', attack: 0.02 }));
        break;
      case 'tick': this.tone(1800, { dur: 0.03, gain: 0.05, type: 'square' }); break;
    }
  }

  // --- Música ambiente: acordes suaves con filtro que respira ---
  startMusic() {
    if (!this.musicOn || !this.enabled || !this.ensure() || this.music) return;
    const c = this.ctx;
    const out = c.createGain(); out.gain.value = 0;
    out.gain.linearRampToValueAtTime(0.11, c.currentTime + 4);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.4;
    const lfo = c.createOscillator(), lfoG = c.createGain();
    lfo.frequency.value = 0.05; lfoG.gain.value = 400; lfo.connect(lfoG).connect(lp.frequency); lfo.start();
    lp.connect(out); out.connect(this.master); out.connect(this.verb);
    const chords = [
      [220.0, 261.6, 329.6, 392.0, 493.9], // Am9
      [174.6, 220.0, 261.6, 329.6, 392.0], // Fmaj7(9)
      [130.8, 196.0, 246.9, 329.6, 392.0], // Cmaj7
      [196.0, 246.9, 293.7, 329.6, 440.0], // G6/9
    ];
    let idx = 0;
    const playChord = () => {
      const now = c.currentTime, dur = 9;
      for (const f of chords[idx % chords.length]) {
        for (const det of [-4, 4]) {
          const o = c.createOscillator(), g = c.createGain();
          o.type = 'triangle'; o.frequency.value = f; o.detune.value = det;
          g.gain.setValueAtTime(0.0001, now);
          g.gain.linearRampToValueAtTime(0.05, now + 3);
          g.gain.linearRampToValueAtTime(0.0001, now + dur + 1.5);
          o.connect(g).connect(lp); o.start(now); o.stop(now + dur + 2);
        }
      }
      // una nota de "campanilla" ocasional
      const bell = chords[idx % chords.length][2 + (idx % 3)] * 4;
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = bell; g.gain.setValueAtTime(0.0001, now + 2); g.gain.exponentialRampToValueAtTime(0.02, now + 2.02); g.gain.exponentialRampToValueAtTime(0.0001, now + 5);
      o.connect(g).connect(out); o.start(now + 2); o.stop(now + 5.2);
      idx++;
    };
    playChord();
    const timer = setInterval(playChord, 8000);
    this.music = { out, lfo, timer };
  }

  stopMusic() {
    if (!this.music) return;
    const { out, lfo, timer } = this.music;
    clearInterval(timer);
    const now = this.ctx.currentTime;
    out.gain.cancelScheduledValues(now);
    out.gain.setValueAtTime(out.gain.value, now);
    out.gain.linearRampToValueAtTime(0, now + 1.5);
    setTimeout(() => { lfo.stop(); out.disconnect(); }, 1800);
    this.music = null;
  }
}
