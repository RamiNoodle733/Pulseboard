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
  type: 'trail' | 'burst' | 'spark';
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

  /** Emit particles radiating from a pulse point */
  emitPulseTrail(x: number, y: number, color: string): void {
    const count = 6 + Math.floor(Math.random() * 5); // 6-10
    if (this.particles.length + count > MAX_PARTICLES) return;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.3 + Math.random() * 0.9;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        born: Date.now(),
        maxLife: 600 + Math.random() * 400,
        color,
        size: 1 + Math.random() * 1.5,
        type: 'trail',
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

    // Shockwave from centroid
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

      // Second ring at high streaks
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
      // Slight gravity on sparks
      if (p.type === 'spark') p.vy += 0.02;
      // Friction
      p.vx *= 0.99;
      p.vy *= 0.99;
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

      const alpha = life * 0.7;
      const a = Math.floor(Math.max(0, Math.min(1, alpha)) * 255)
        .toString(16)
        .padStart(2, '0');

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * life, 0, Math.PI * 2);
      ctx.fillStyle = p.color + a;
      ctx.fill();
    }

    for (const sw of this.shockwaves) {
      const age = now - sw.born;
      if (age < 0) continue; // delayed start
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
