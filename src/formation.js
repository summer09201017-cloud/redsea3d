// ══════════════════════════════════════════════════════════════════════
// formation.js —— Formation 編隊/護送地基(C1 核心,可整檔搬走)
// 零依賴(連 three 都不用,純 {x,z} 算術)、零遊戲耦合。照 water/terrain kit 收割範式:
//   1. slotOffsets(n)            隊形槽位(領袖後方縱隊/楔形)
//   2. FollowerBand              跟隨班:arrive 趨近自己的槽位+彼此分離+繞開障礙,
//                                落後了自動加速歸隊(「一個也不失落」的溫柔規則)
// 換皮:紅海=以色列人跟摩西;五餅二魚=群眾跟門徒分組;護送=信徒跟以斯拉。
// ══════════════════════════════════════════════════════════════════════

// ── 量值可調:跟隨手感 ──
export const FORMATION = {
  walkSpeed: 2.6,     // 跟隨巡航速度
  catchUpMul: 1.8,    // 落後(>catchUpDist)時的加速倍率=自動歸隊
  catchUpDist: 5.5,
  accel: 3.2,         // arrive 趨近加速度
  drag: 1.6,
  sepDist: 0.8,       // 彼此最小間距
  sepPush: 2.4,
  stumbleSlow: 0.25,  // 絆到時速度倍率
  stumbleTime: 1.2,
};

// 槽位:領袖後方 cols 路縱隊(dx=後方距離為負,dz=橫向散開)
export function slotOffsets(n, { spacing = 1.25, cols = 4 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols) + 1;
    const col = (i % cols) - (cols - 1) / 2;
    out.push({ dx: -row * spacing - 0.8, dz: col * spacing });
  }
  return out;
}

export class FollowerBand {
  // obstacles: [{x,z,r}](選)——跟隨者會繞開
  constructor(n, { spacing, cols, obstacles = [], zClamp = null } = {}) {
    this.slots = slotOffsets(n, { spacing, cols });
    this.obstacles = obstacles;
    this.zClamp = zClamp; // {min,max} 走廊邊界
    this.followers = this.slots.map((s, i) => ({
      x: s.dx, z: s.dz, vx: 0, vz: 0,
      slot: s, stumbleT: 0, phase: Math.random() * 6.28, speed: 0,
    }));
  }

  // leader={x,z,heading(弧度,0=+x 方向)};回傳 followers(含 x/z/speed/stumbleT/phase 供動畫)
  update(dt, leader) {
    const F = FORMATION;
    const cos = Math.cos(leader.heading || 0);
    const sin = Math.sin(leader.heading || 0);
    for (const f of this.followers) {
      // 槽位世界座標(隨領袖朝向旋轉)
      const tx = leader.x + f.slot.dx * cos - f.slot.dz * sin;
      const tz = leader.z + f.slot.dx * sin + f.slot.dz * cos;
      const dx = tx - f.x;
      const dz = tz - f.z;
      const dist = Math.hypot(dx, dz);
      // arrive:遠=全速(落後自動加速歸隊),近=減速
      let want = Math.min(F.walkSpeed * (dist > F.catchUpDist ? F.catchUpMul : 1), dist * 2.2);
      if (f.stumbleT > 0) {
        f.stumbleT -= dt;
        want *= F.stumbleSlow;
      }
      const inv = dist > 0.001 ? 1 / dist : 0;
      let ax = dx * inv * want - f.vx;
      let az = dz * inv * want - f.vz;
      f.vx += ax * Math.min(1, F.accel * dt);
      f.vz += az * Math.min(1, F.accel * dt);
      // 彼此分離(不疊人)
      for (const o of this.followers) {
        if (o === f) continue;
        const ox = f.x - o.x, oz = f.z - o.z;
        const d = Math.hypot(ox, oz);
        if (d > 0.001 && d < F.sepDist) {
          f.vx += (ox / d) * F.sepPush * dt * 3;
          f.vz += (oz / d) * F.sepPush * dt * 3;
        }
      }
      // 繞開障礙(推離+絆到=stumble)
      for (const ob of this.obstacles) {
        const ox = f.x - ob.x, oz = f.z - ob.z;
        const d = Math.hypot(ox, oz);
        if (d < ob.r + 0.5 && d > 0.001) {
          f.vx += (ox / d) * 4 * dt * 3;
          f.vz += (oz / d) * 4 * dt * 3;
          if (d < ob.r + 0.1 && f.stumbleT <= 0) f.stumbleT = F.stumbleTime;
        }
      }
      f.x += f.vx * dt;
      f.z += f.vz * dt;
      if (this.zClamp) f.z = Math.min(this.zClamp.max, Math.max(this.zClamp.min, f.z));
      f.speed = Math.hypot(f.vx, f.vz);
      f.phase += dt * (1.5 + f.speed * 1.8);
    }
    return this.followers;
  }

  // 聚攏度:距領袖 radius 內的比例(HUD 用;永遠會自己回到 1)
  cohesion(leader, radius = 7) {
    let near = 0;
    for (const f of this.followers) {
      if (Math.hypot(f.x - leader.x, f.z - leader.z) <= radius) near++;
    }
    return this.followers.length ? near / this.followers.length : 1;
  }
}
