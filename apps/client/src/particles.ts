const MAX_PARTICLES = 500;

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  maxLife: number;
  color: string;
  size: number;
  type: 'trail' | 'burst' | 'spark' | 'flow' | 'sparkle' | 'comet' | 'ring';
}

export interface Shockwave {
  x: number;
  y: number;
  born: number;
  maxLife: number;
  maxRadius: number;
}

export class ParticleSystem {
  particles: Particle[] = [];
  shockwaves: Shockwave[] = [];

  /** Emit particles from presence/movement */
  emitPresenceTrail(x: number, y: number, color: string, energy: number = 1, trailStyle: number = 0): void {
    const count = 2 + Math.floor(energy * 3);
    if (this.particles.length + count > MAX_PARTICLES) return;

    if (trailStyle === 1) {
      this.emitSparkleTrail(x, y, color, energy);
      return;
    }
    if (trailStyle === 2) {
      this.emitCometTrail(x, y, color, energy);
      return;
    }
    if (trailStyle === 3) {
      this.emitRingTrail(x, y, color, energy);
      return;
    }

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.2 + Math.random() * 0.6 * energy;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        born: Date.now(),
        maxLife: 400 + Math.random() * 300,
        color,
        size: 1 + Math.random() * energy,
        type: 'trail',
      });
    }

    if (energy > 0.5 && this.particles.length + 2 <= MAX_PARTICLES) {
      const flowAngle = Math.random() * Math.PI * 2;
      const flowSpeed = 0.1 + energy * 0.3;
      this.particles.push({
        x,
        y,
        vx: Math.cos(flowAngle) * flowSpeed,
        vy: Math.sin(flowAngle) * flowSpeed,
        born: Date.now(),
        maxLife: 1200 + Math.random() * 500,
        color,
        size: 2 + energy,
        type: 'flow',
      });
    }
  }

  private emitSparkleTrail(x: number, y: number, color: string, energy: number): void {
    const count = 3 + Math.floor(energy * 4);
    if (this.particles.length + count > MAX_PARTICLES) return;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.3 + Math.random() * 0.8 * energy;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        born: Date.now() + Math.random() * 100,
        maxLife: 300 + Math.random() * 400,
        color,
        size: 0.5 + Math.random() * 1.5,
        type: 'sparkle',
      });
    }
  }

  private emitCometTrail(x: number, y: number, color: string, energy: number): void {
    const count = 4 + Math.floor(energy * 3);
    if (this.particles.length + count > MAX_PARTICLES) return;

    for (let i = 0; i < count; i++) {
      const spreadAngle = (Math.random() - 0.5) * 0.8;
      const speed = 0.1 + Math.random() * 0.3;
      this.particles.push({
        x,
        y,
        vx: Math.cos(Math.PI + spreadAngle) * speed,
        vy: Math.sin(Math.PI + spreadAngle) * speed,
        born: Date.now(),
        maxLife: 600 + Math.random() * 400,
        color,
        size: 1 + Math.random() * (1 + energy),
        type: 'comet',
      });
    }
  }

  private emitRingTrail(x: number, y: number, color: string, energy: number): void {
    const ringCount = 6 + Math.floor(energy * 4);
    if (this.particles.length + ringCount > MAX_PARTICLES) return;

    const ringRadius = 5 + energy * 8;
    for (let i = 0; i < ringCount; i++) {
      const angle = (i / ringCount) * Math.PI * 2;
      this.particles.push({
        x: x + Math.cos(angle) * ringRadius,
        y: y + Math.sin(angle) * ringRadius,
        vx: Math.cos(angle) * 0.3,
        vy: Math.sin(angle) * 0.3,
        born: Date.now(),
        maxLife: 500 + Math.random() * 300,
        color,
        size: 0.8 + Math.random(),
        type: 'ring',
      });
    }
  }

  /** Emit burst particles + shockwave for a sync event */
  emitSyncBurst(
    positions: { x: number; y: number; color: string }[],
    streak: number,
  ): void {
    const perPos = 15 + Math.min(streak, 10);
    const total = perPos * positions.length;
    if (this.particles.length + total > MAX_PARTICLES) return;

    for (const pos of positions) {
      for (let i = 0; i < perPos; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.5 + Math.random() * 2.0;
        const isSpark = streak > 5 && Math.random() < 0.3;
        this.particles.push({
          x: pos.x,
          y: pos.y,
          vx: Math.cos(angle) * speed * (isSpark ? 2 : 1),
          vy: Math.sin(angle) * speed * (isSpark ? 2 : 1),
          born: Date.now(),
          maxLife: isSpark ? 1200 : 800 + Math.random() * 400,
          color: pos.color,
          size: isSpark ? 1.5 : 1 + Math.random() * 2,
          type: isSpark ? 'spark' : 'burst',
        });
      }
    }

    if (positions.length >= 2) {
      const cx = positions.reduce((s, p) => s + p.x, 0) / positions.length;
      const cy = positions.reduce((s, p) => s + p.y, 0) / positions.length;
      this.shockwaves.push({
        x: cx,
        y: cy,
        born: Date.now(),
        maxLife: 1000 + Math.min(streak, 10) * 100,
        maxRadius: 150 + Math.min(streak, 10) * 20,
      });

      if (streak > 10) {
        this.shockwaves.push({
          x: cx,
          y: cy,
          born: Date.now() + 100,
          maxLife: 800,
          maxRadius: 100 + streak * 10,
        });
      }
    }
  }

  /** Advance all particles by one frame */
  update(now: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      const age = now - p.born;
      if (age > p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx;
      p.y += p.vy;
      if (p.type === 'spark') p.vy += 0.02;
      if (p.type === 'flow') {
        p.vx *= 0.995;
        p.vy *= 0.995;
      } else if (p.type === 'sparkle') {
        p.vx += (Math.random() - 0.5) * 0.1;
        p.vy += (Math.random() - 0.5) * 0.1;
        p.vx *= 0.97;
        p.vy *= 0.97;
      } else if (p.type === 'comet') {
        p.vx *= 0.98;
        p.vy *= 0.98;
      } else if (p.type === 'ring') {
        p.vx *= 0.96;
        p.vy *= 0.96;
      } else {
        p.vx *= 0.99;
        p.vy *= 0.99;
      }
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      if (now - this.shockwaves[i].born > this.shockwaves[i].maxLife) {
        this.shockwaves.splice(i, 1);
      }
    }
  }

  /** Render all particles and shockwaves to a canvas context */
  render(ctx: CanvasRenderingContext2D): void {
    const now = Date.now();

    for (const p of this.particles) {
      const age = now - p.born;
      const life = 1 - age / p.maxLife;
      if (life <= 0) continue;

      let alpha: number;
      if (p.type === 'flow') {
        alpha = life * 0.3;
      } else if (p.type === 'sparkle') {
        const twinkle = Math.sin(age * 0.02 + p.x) * 0.5 + 0.5;
        alpha = life * 0.8 * twinkle;
      } else if (p.type === 'comet') {
        alpha = life * 0.6;
      } else if (p.type === 'ring') {
        alpha = life * 0.5;
      } else {
        alpha = life * 0.7;
      }

      const a = Math.floor(Math.max(0, Math.min(1, alpha)) * 255)
        .toString(16)
        .padStart(2, '0');

      ctx.beginPath();
      let renderSize: number;
      if (p.type === 'flow') {
        renderSize = p.size * (0.5 + life * 0.5);
      } else if (p.type === 'sparkle') {
        renderSize = p.size * (0.3 + life * 0.7);
      } else if (p.type === 'ring') {
        renderSize = p.size * (0.4 + life * 0.6);
      } else {
        renderSize = p.size * life;
      }
      ctx.arc(p.x, p.y, renderSize, 0, Math.PI * 2);
      ctx.fillStyle = p.color + a;
      ctx.fill();
    }

    for (const sw of this.shockwaves) {
      const age = now - sw.born;
      if (age < 0) continue;
      const life = 1 - age / sw.maxLife;
      if (life <= 0) continue;

      const radius = (1 - life) * sw.maxRadius;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 255, 255, ${life * 0.15})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  clear(): void {
    this.particles = [];
    this.shockwaves = [];
  }
}
