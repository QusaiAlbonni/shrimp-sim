// Tiny procedural ambience: filtered noise hum plus occasional bubble blips.
export class Ambience {
  constructor() { this.ctx = null; this.on = false; this.timer = null; }
  async start() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC();
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const d = buf.getChannelData(0); let last = 0;
      for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
      this.gain = this.ctx.createGain(); this.gain.gain.value = 0;
      src.connect(lp).connect(this.gain).connect(this.ctx.destination); src.start();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.on = true; this.gain.gain.setTargetAtTime(0.05, this.ctx.currentTime, 0.5);
    this.scheduleBlip();
  }
  stop() { this.on = false; if (this.gain) this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3); clearTimeout(this.timer); }
  toggle() { return this.on ? (this.stop(), false) : (this.start(), true); }
  scheduleBlip() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { if (this.on) { this.blip(); this.scheduleBlip(); } }, 400 + Math.random() * 1800);
  }
  blip(pitch = 600 + Math.random() * 900) {
    if (!this.ctx || !this.on) return;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain(); const t = this.ctx.currentTime;
    o.type = 'sine'; o.frequency.setValueAtTime(pitch, t); o.frequency.exponentialRampToValueAtTime(pitch * 1.6, t + 0.08);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + 0.15);
  }
  chime() { if (!this.on) return; this.blip(880); setTimeout(() => this.blip(1320), 90); setTimeout(() => this.blip(1760), 180); }
}
