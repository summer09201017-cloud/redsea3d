// 紅海過乾地(出14)3D —— 單一 class(場景+狀態機+編隊+動畫),不碰 DOM(照 3d-game-kit 三件套)
// C1 Formation 首跑:編隊地基全在 src/formation.js(slotOffsets/FollowerBand,零依賴純算術)
// ——之後五餅二魚(分組群眾)、以斯拉護送照搬。水牆視覺借 water-kit 的 waterHeightAt(牆面活的)。
// ⛪ 神學鐵則:海分開是神的作為(出14:21「耶和華便用大東風」)——摩西舉杖=敘事按鈕固定觸發;
//   玩家的工作是「牧養」:把百姓帶過去,一個也不失落(落後者永遠會歸隊,永不會輸)。
import * as THREE from "three";
import { waterHeightAt } from "./water.js";
import { FollowerBand } from "./formation.js";

export const DIFFICULTY_LABELS = {
  kids: "幼兒", child: "兒童", easy: "入門", normal: "標準", hard: "職業",
};

// 五檔難度(量值鐵則):走廊長度/礁石數/隊伍人數
export const DIFFICULTY_PRESETS = {
  kids:   { distance: 70,  rocks: 4,  band: 8 },
  child:  { distance: 90,  rocks: 7,  band: 10 },
  easy:   { distance: 110, rocks: 10, band: 12 },
  normal: { distance: 130, rocks: 14, band: 14 },
  hard:   { distance: 150, rocks: 18, band: 16 },
};

const CORRIDOR_HALF = 6;   // 乾地走廊半寬(牆在 ±6)
const WALL_H = 9;          // 水牆高
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const rand = (a, b) => a + Math.random() * (b - a);
const randSigned = (a) => rand(-a, a);

export class RedSeaGame {
  constructor({ canvas }) {
    this.canvas = canvas;
    this.difficulty = "easy";

    // 狀態機:menu → staff(舉杖) → part(水牆升起) → cross(走乾地) → close(牆合攏) → done
    this.phase = "menu";
    this.message = "選擇難度後開始。";
    this.time = 0;
    this.hudTimer = 0;
    this.phaseT = 0;
    this.cameraView = 0;
    this.cameraShake = 0;
    this.actionPrompt = null;

    this.onHud = null;
    this.onEvent = null;

    this.controls = { left: false, right: false };

    // 摩西(玩家)
    this.moses = { x: 0, z: 0, heading: 0, walk: 0 };
    this.wallRise = 0;      // 0..1 水牆升起
    this.closeT = 0;        // 合攏動畫
    this.egyptX = -30;      // 追兵位置(永遠追不上=溫柔壓力)

    // ── Three 場景(清晨紅海) ──
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2a4a68);
    this.scene.fog = new THREE.Fog(0x2a4a68, 40, 110);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 300);
    this._camPos = new THREE.Vector3(-8, 6, 10);
    this._camLook = new THREE.Vector3(0, 1, 0);
    this.camera.position.copy(this._camPos);

    this.hemi = new THREE.HemisphereLight(0xbfd8ee, 0x2a3a4a, 0.9);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffe8c4, 1.0);
    sun.position.set(-10, 24, 14);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xa8c8e8, 0.35);
    fill.position.set(12, 14, -10);
    this.scene.add(fill);

    this.buildScene();
    this.mosesFig = this.makeFigure({ robe: 0xe8e0d0, cloth: 0x8a5a3c, beard: 0xdad5cc, staff: true });
    this.mosesFig.group.position.set(0, 0, 0);
    this.scene.add(this.mosesFig.group);

    this.band = null;        // start() 建(人數吃難度)
    this.followerFigs = [];

    this.clock = new THREE.Clock();
    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.startLoop();
  }

  emitEvent(type, payload = {}) { if (this.onEvent) this.onEvent({ type, ...payload }); }
  get preset() { return DIFFICULTY_PRESETS[this.difficulty] || DIFFICULTY_PRESETS.easy; }

  // ── 場景:海床走廊 + 兩道活水牆 + 對岸 + 追兵 ──
  buildScene() {
    // 海床(乾地走廊,沿 +x)
    const bed = new THREE.Mesh(
      new THREE.PlaneGeometry(400, CORRIDOR_HALF * 2 + 2),
      new THREE.MeshStandardMaterial({ color: 0xc9b98a, roughness: 1 }),
    );
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(120, 0, 0);
    this.scene.add(bed);
    // 走廊外的深海底
    const deep = new THREE.Mesh(new THREE.PlaneGeometry(500, 300), new THREE.MeshStandardMaterial({ color: 0x11293c, roughness: 1 }));
    deep.rotation.x = -Math.PI / 2;
    deep.position.set(120, -0.2, 0);
    this.scene.add(deep);

    // ★兩道水牆(vertical plane,每幀用 water-kit 波高場位移=牆面是活的)
    this.walls = [];
    for (const side of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(360, WALL_H, 90, 10);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x1f6e96, roughness: 0.3, metalness: 0.1,
        transparent: true, opacity: 0.82, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(140, WALL_H / 2, side * CORRIDOR_HALF);
      mesh.scale.y = 0.02; // 開場未分開(貼海面)
      this.scene.add(mesh);
      const pos = geo.attributes.position;
      const bx = new Float32Array(pos.count);
      const by = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) { bx[i] = pos.getX(i); by[i] = pos.getY(i); }
      this.walls.push({ mesh, pos, bx, by, side });
    }

    // 牆裡的魚(神蹟的可愛註腳:水牆裡看得到魚游)
    this.fishes = [];
    const fishMat = new THREE.MeshStandardMaterial({ color: 0x9fc4d8, roughness: 0.6 });
    for (let i = 0; i < 10; i++) {
      const fish = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), fishMat);
      body.scale.set(1.6, 0.8, 0.6);
      fish.add(body);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 4), fishMat);
      tail.rotation.z = Math.PI / 2;
      tail.position.x = -0.6;
      fish.add(tail);
      const side = i % 2 === 0 ? -1 : 1;
      fish.position.set(rand(10, 160), rand(1.5, WALL_H - 2), side * (CORRIDOR_HALF + 0.4));
      fish.visible = false;
      this.scene.add(fish);
      this.fishes.push({ group: fish, baseX: fish.position.x, phase: rand(0, 6) });
    }

    // 對岸(終點沙丘,start() 時依 distance 擺)
    this.shore = new THREE.Mesh(
      new THREE.BoxGeometry(40, 3, 60),
      new THREE.MeshStandardMaterial({ color: 0xd8c89a, roughness: 1 }),
    );
    this.shore.position.set(150 + 20, -0.6, 0);
    this.scene.add(this.shore);
    // 對岸棕櫚 ×2
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f8f4f, roughness: 0.9 });
    this.palms = [];
    for (const pz of [-4, 5]) {
      const tree = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.9, 8), trunkMat);
        seg.position.set(Math.sin(i * 0.4) * 0.25, 0.45 + i * 0.85, 0);
        tree.add(seg);
      }
      for (let k = 0; k < 5; k++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2.0, 5), leafMat);
        const a = (k / 5) * Math.PI * 2;
        leaf.position.set(Math.cos(a) * 0.8, 3.9, Math.sin(a) * 0.8);
        leaf.rotation.z = Math.cos(a) * 1.25;
        leaf.rotation.x = -Math.sin(a) * 1.25;
        tree.add(leaf);
      }
      this.palms.push({ tree, pz });
      this.scene.add(tree);
    }

    // 追兵(遠處戰車剪影+塵霧;永遠追不上)
    this.egypt = new THREE.Group();
    const chMat = new THREE.MeshStandardMaterial({ color: 0x2a2e38, roughness: 0.9 });
    for (let i = 0; i < 5; i++) {
      const ch = new THREE.Group();
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.9), chMat);
      cab.position.y = 0.75;
      ch.add(cab);
      for (const wz of [-0.4, 0.4]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 10), chMat);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(0, 0.42, wz);
        ch.add(wheel);
      }
      const horse = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.5), chMat);
      horse.position.set(1.3, 0.75, 0);
      ch.add(horse);
      const hh = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.35), chMat);
      hh.position.set(1.95, 1.15, 0);
      ch.add(hh);
      ch.position.set(randSigned(2), 0, -4 + i * 2);
      this.egypt.add(ch);
    }
    const dust = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x8a7a5a, transparent: true, opacity: 0.28 }),
    );
    dust.position.set(-2, 1.6, 0);
    dust.scale.set(1.6, 0.7, 1.6);
    this.egypt.add(dust);
    this.scene.add(this.egypt);

    // 礁石(start() 時依難度撒)
    this.rockMeshes = [];
    this.rockMat = new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 1 });
  }

  // 以色列人/摩西(★臉部鐵則:眼白+瞳孔+眉+嘴;長袍+頭巾;摩西=白鬚+杖)
  makeFigure({ robe, cloth, beard, staff = false }) {
    const g = new THREE.Group();
    g.rotation.order = "YXZ";
    const robeMat = new THREE.MeshStandardMaterial({ color: robe, roughness: 0.95 });
    const clothMat = new THREE.MeshStandardMaterial({ color: cloth, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xf0d3aa, roughness: 0.7, emissive: 0x7a6446, emissiveIntensity: 0.45 });
    const dark = new THREE.MeshBasicMaterial({ color: 0x23190f });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const beardMat = new THREE.MeshStandardMaterial({ color: beard, roughness: 1 });

    const gown = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.4, 1.0, 10), robeMat);
    gown.position.y = 0.5;
    g.add(gown);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.24), robeMat);
    torso.position.y = 1.02;
    g.add(torso);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 10), clothMat);
    belt.position.y = 0.74;
    g.add(belt);
    const mkArm = (x) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 1.18, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.4, 0.11), robeMat);
      arm.position.y = -0.19;
      pivot.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), skin);
      hand.position.y = -0.42;
      pivot.add(hand);
      g.add(pivot);
      return pivot;
    };
    const armL = mkArm(-0.27), armR = mkArm(0.27);
    const mkLeg = (x) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.14, 0);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.38, 0.13), skin);
      leg.position.y = -0.19;
      pivot.add(leg);
      g.add(pivot);
      return pivot;
    };
    const legL = mkLeg(-0.11), legR = mkLeg(0.11);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), skin);
    head.position.y = 1.4;
    g.add(head);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.195, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), clothMat);
    hood.position.y = 1.41;
    g.add(hood);
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8), white);
    eyeL.position.set(-0.065, 1.43, 0.145);
    g.add(eyeL);
    const eyeR = eyeL.clone(); eyeR.position.x = 0.065; g.add(eyeR);
    const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.017, 6, 6), dark);
    pupilL.position.set(-0.065, 1.43, 0.175); g.add(pupilL);
    const pupilR = pupilL.clone(); pupilR.position.x = 0.065; g.add(pupilR);
    const browL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.015, 0.015), dark);
    browL.position.set(-0.065, 1.49, 0.16); browL.rotation.z = 0.14; g.add(browL);
    const browR = browL.clone(); browR.position.x = 0.065; browR.rotation.z = -0.14; g.add(browR);
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.011, 6, 10, Math.PI), dark);
    mouth.position.set(0, 1.34, 0.16); mouth.rotation.z = Math.PI; g.add(mouth);
    const beardMesh = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 8), beardMat);
    beardMesh.position.set(0, 1.27, 0.11); beardMesh.rotation.x = Math.PI;
    g.add(beardMesh);

    let staffMesh = null;
    if (staff) {
      staffMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.1, 8), new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.9 }));
      staffMesh.position.set(0, -0.35, 0.05);
      armR.add(staffMesh); // 掛在右手,舉杖=舉臂
    }

    return { group: g, armL, armR, legL, legR, staffMesh };
  }

  // ── 流程 API ──
  applyPresentation({ difficulty }) {
    if (difficulty && DIFFICULTY_PRESETS[difficulty]) this.difficulty = difficulty;
  }

  start() {
    const p = this.preset;
    this.phase = "staff";
    this.phaseT = 0;
    this.moses = { x: 0, z: 0, heading: 0, walk: 0 };
    this.wallRise = 0;
    this.closeT = 0;
    this.egyptX = -32;
    this.actionPrompt = "摩西向海伸杖(出14:21)";
    this.goal = p.distance;

    // 對岸/棕櫚移到終點
    this.shore.position.x = this.goal + 20;
    for (const pm of this.palms) pm.tree.position.set(this.goal + rand(6, 12), 2.4 - 3 + 3, pm.pz);
    for (const pm of this.palms) pm.tree.position.y = 0.9;

    // 礁石重撒
    for (const m of this.rockMeshes) this.scene.remove(m);
    this.rockMeshes = [];
    this.rocks = [];
    for (let i = 0; i < p.rocks; i++) {
      const rx = rand(14, this.goal - 10);
      const rz = randSigned(CORRIDOR_HALF - 1.2);
      const rr = rand(0.5, 0.9);
      this.rocks.push({ x: rx, z: rz, r: rr });
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rr, 0), this.rockMat);
      rock.position.set(rx, rr * 0.5, rz);
      rock.rotation.set(rand(0, 3), rand(0, 3), 0);
      this.scene.add(rock);
      this.rockMeshes.push(rock);
    }

    // 編隊(★C1 地基)
    this.band = new FollowerBand(p.band, {
      obstacles: this.rocks,
      zClamp: { min: -CORRIDOR_HALF + 0.6, max: CORRIDOR_HALF - 0.6 },
    });
    for (const f of this.followerFigs) this.scene.remove(f.fig.group);
    this.followerFigs = [];
    const robes = [0x8a5a3c, 0x6a7b8c, 0x7a6a4a, 0x5a6b8f, 0x8f5a6b, 0x5f7a5a];
    const cloths = [0xb64f3a, 0x3f5566, 0xd8c27a, 0x9a8ac0, 0xc09a8a, 0x8ac0a0];
    for (let i = 0; i < p.band; i++) {
      const fig = this.makeFigure({ robe: robes[i % robes.length], cloth: cloths[(i + 2) % cloths.length], beard: 0x2a1f16 });
      this.scene.add(fig.group);
      this.followerFigs.push({ fig });
    }

    // 魚顯示重置(牆升起才看得到)
    for (const f of this.fishes) f.group.visible = false;

    this.message = "法老的軍兵在後面——摩西,向海伸杖!";
    this.emitEvent("staff");
    this.pushHud();
  }

  triggerAction() {
    if (this.phase === "staff" && this.actionPrompt) {
      this.actionPrompt = null;
      this.phase = "part";
      this.phaseT = 0;
      this.message = "耶和華便用大東風,使海水一夜退去,水便分開!(出14:21)";
      this.emitEvent("part");
      this.pushHud();
    }
  }

  cycleCameraView() {
    this.cameraView = (this.cameraView + 1) % 3;
    const names = ["跟隨視角", "高空俯瞰", "隊伍側望"];
    this.message = `視角:${names[this.cameraView]}`;
    this.pushHud();
  }

  // ── 主迴圈 ──
  startLoop() {
    if (this._raf) return;
    const loop = () => {
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.time += dt;
      this.update(dt);
      this.renderFrame(dt);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  update(dt) {
    this.phaseT += dt;
    switch (this.phase) {
      case "staff":
        // 追兵慢慢逼近(壓力,永不到)
        this.egyptX = Math.min(this.egyptX + dt * 0.5, this.moses.x - 22);
        break;
      case "part": {
        this.wallRise = Math.min(1, this.wallRise + dt / 2.6);
        if (this.wallRise > 0.5) for (const f of this.fishes) f.group.visible = true;
        if (this.wallRise >= 1 && this.phaseT > 3) {
          this.phase = "cross";
          this.phaseT = 0;
          this.message = "走乾地!水在左右作了牆垣——帶大家過去!(出14:22)";
          this.emitEvent("cross");
        }
        break;
      }
      case "cross": {
        // 摩西自動前行,A/D 左右導引;礁石=溫柔擋一下
        const steer = (this.controls.right ? 1 : 0) - (this.controls.left ? 1 : 0);
        this.moses.z = clamp(this.moses.z + steer * 3.2 * dt, -CORRIDOR_HALF + 0.8, CORRIDOR_HALF - 0.8);
        let speed = 3.0;
        for (const r of this.rocks) {
          const d = Math.hypot(this.moses.x - r.x, this.moses.z - r.z);
          if (d < r.r + 0.5) {
            speed = 0.9;
            this.moses.z += (this.moses.z - r.z) * dt * 4; // 滑開
          }
        }
        this.moses.x += speed * dt;
        this.moses.walk += dt * (2 + speed);
        this.egyptX = this.moses.x - 24 + Math.sin(this.time * 0.7) * 1.5;

        this.band.update(dt, { x: this.moses.x, z: this.moses.z, heading: 0 });

        if (this.moses.x >= this.goal) {
          this.phase = "close";
          this.phaseT = 0;
          this.message = "全都上岸了!水牆合攏——耶和華拯救以色列人!(出14)";
          this.emitEvent("close");
        }
        break;
      }
      case "close": {
        // 隊伍繼續走上岸聚攏
        this.band.update(dt, { x: this.goal + 8, z: 0, heading: 0 });
        this.moses.x = Math.min(this.moses.x + 2.4 * dt, this.goal + 10);
        this.moses.walk += dt * 4;
        // ★水牆等「全隊過完」才合攏(出14:合攏的是追兵——絕不能關在以色列人身上)
        const allAshore = this.band.followers.every((f) => f.x > this.goal - 1.5);
        if (allAshore) this.closeT = Math.min(1, this.closeT + dt / 2.4);
        if (this.closeT >= 1 && this.phaseT > 3.4) this.finish();
        break;
      }
      default:
        break;
    }
    this.hudTick(dt);
  }

  finish() {
    this.phase = "done";
    const title = "耶和華拯救以色列人 🌊";
    const text = "「以色列人看見耶和華向埃及人所行的大事,就敬畏耶和華,又信服他和他的僕人摩西。」(出14:31)\n\n海不是摩西分開的,是耶和華;你做的,是把神託付的人一個一個帶過去——一個也不失落。牧養,就是這樣的工作。";
    this.message = "就敬畏耶和華,又信服他和他的僕人摩西。(出14:31)";
    this.emitEvent("finish", { title, text });
    this.pushHud();
  }

  // ── HUD ──
  hudTick(dt) {
    this.hudTimer -= dt;
    if (this.phase === "cross" || this.hudTimer <= 0) {
      this.hudTimer = 0.12;
      this.pushHud();
    }
  }

  pushHud() {
    if (!this.onHud) return;
    const progress = this.phase === "menu" || this.phase === "staff" || this.phase === "part"
      ? 0
      : this.phase === "cross" ? clamp(this.moses.x / this.goal, 0, 1) : 1;
    this.onHud({
      phase: this.phase,
      message: this.message,
      progress,
      cohesion: this.band ? this.band.cohesion(this.moses) : 1,
      bandSize: this.band ? this.band.followers.length : 0,
      meterActive: this.phase === "cross",
      actionPrompt: this.actionPrompt,
      cameraView: this.cameraView,
    });
  }

  // ── 呈現 ──
  renderFrame(dt) {
    // ★活水牆:升起(part)/常態波動(water-kit 波高場)/合攏(close)
    for (const w of this.walls) {
      const targetScale = this.phase === "close" || this.phase === "done"
        ? Math.max(0.02, 1 - this.closeT) : this.wallRise;
      w.mesh.scale.y = Math.max(0.02, targetScale);
      w.mesh.position.y = (WALL_H * w.mesh.scale.y) / 2;
      // 牆面波動(只在有高度時刷;90×10 段便宜)
      if (w.mesh.scale.y > 0.05) {
        for (let i = 0; i < w.pos.count; i++) {
          const wave = waterHeightAt(w.bx[i] * 0.5, w.by[i] * 0.8 + w.side * 3, this.time) * 2.2;
          w.pos.setZ(i, wave);
        }
        w.pos.needsUpdate = true;
      }
      // 合攏尾聲:牆倒回海面的白花(相機震)
      if (this.phase === "close" && this.closeT > 0.9 && !this._closeSplashed) {
        this._closeSplashed = true;
        this.cameraShake = 0.5;
        this.emitEvent("splash-close");
      }
    }
    if (this.phase === "staff" || this.phase === "menu") this._closeSplashed = false;

    // 魚(牆裡游)
    for (const f of this.fishes) {
      if (!f.group.visible) continue;
      f.group.position.x = f.baseX + Math.sin(this.time * 0.6 + f.phase) * 3;
      f.group.position.y = clamp(f.group.position.y + Math.sin(this.time * 0.9 + f.phase) * 0.004, 1, WALL_H * this.wallRise - 0.5 || 1);
      f.group.rotation.y = Math.cos(this.time * 0.6 + f.phase) > 0 ? 0 : Math.PI;
    }

    // 摩西
    const mf = this.mosesFig;
    mf.group.position.set(this.moses.x, 0, this.moses.z);
    if (this.phase === "staff") {
      mf.group.rotation.y = Math.PI / 2; // 面向海(+x)
      mf.armR.rotation.x = -0.4;         // 待舉
    } else if (this.phase === "part") {
      mf.group.rotation.y = Math.PI / 2;
      mf.armR.rotation.x = lerp(mf.armR.rotation.x, -Math.PI * 0.9, 1 - Math.exp(-dt * 3)); // ★舉杖
      mf.armL.rotation.x = -0.3;
    } else if (this.phase === "cross" || this.phase === "close") {
      mf.group.rotation.y = Math.PI / 2;
      const sw = Math.sin(this.moses.walk * 2.2);
      mf.legL.rotation.x = sw * 0.55;
      mf.legR.rotation.x = -sw * 0.55;
      mf.armL.rotation.x = -sw * 0.4;
      mf.armR.rotation.x = -0.5; // 杖拄著走
    } else if (this.phase === "done") {
      mf.armR.rotation.x = -Math.PI * 0.85 + Math.sin(this.time * 3) * 0.2; // 舉杖讚美
      mf.armL.rotation.x = -Math.PI * 0.7;
      mf.legL.rotation.x = 0;
      mf.legR.rotation.x = 0;
    }

    // 跟隨者(★C1 地基:formation.js 純算術 → 這裡只管畫)
    if (this.band) {
      const fs = this.band.followers;
      for (let i = 0; i < this.followerFigs.length && i < fs.length; i++) {
        const f = fs[i];
        const fig = this.followerFigs[i].fig;
        fig.group.position.set(f.x, 0, f.z);
        fig.group.rotation.y = Math.PI / 2;
        const sw = Math.sin(f.phase * 2.0);
        const amp = clamp(f.speed / 2.6, 0, 1);
        fig.legL.rotation.x = sw * 0.5 * amp;
        fig.legR.rotation.x = -sw * 0.5 * amp;
        fig.armL.rotation.x = -sw * 0.35 * amp;
        fig.armR.rotation.x = sw * 0.35 * amp;
        // 絆到:晃一下(永不摔傷)
        if (f.stumbleT > 0) fig.group.rotation.z = Math.sin(this.time * 18) * 0.12 * f.stumbleT;
        else fig.group.rotation.z = 0;
        // 終局歡呼
        if (this.phase === "done") {
          fig.group.position.y = Math.abs(Math.sin(this.time * 6 + i)) * 0.18;
          fig.armL.rotation.x = -Math.PI * 0.8;
          fig.armR.rotation.x = -Math.PI * 0.8;
        }
      }
    }

    // 追兵
    this.egypt.position.x = this.egyptX;
    this.egypt.position.z = this.moses.z * 0.3;

    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(dt) {
    const k = 1 - Math.exp(-dt * 2.4);
    const m = this.moses;
    let focus, offset;
    // ★鏡頭永遠留在走廊內(z 半寬 6)——出牆=隔著半透明水牆看,整片暗藍(首跑實踩)
    if (this.phase === "done" || this.phase === "close") {
      focus = new THREE.Vector3(this.goal + 6, 1.4, 0);
      offset = new THREE.Vector3(-11, 6, 4);
    } else {
      focus = new THREE.Vector3(m.x + 5, 1.2, m.z * 0.35);
      offset = [
        new THREE.Vector3(-9.5, 5.5, 3.8),  // 跟隨(廊內)
        new THREE.Vector3(-2, 20, 2),       // 高空
        new THREE.Vector3(-3, 2.4, 4.6),    // 側望(廊內)
      ][this.cameraView];
    }
    this._camLook.lerp(focus, k);
    this._camPos.lerp(focus.clone().add(offset), k);
    if (this.cameraShake > 0) this.cameraShake = Math.max(0, this.cameraShake - dt);
    const sh = this.cameraShake;
    this.camera.position.set(
      this._camPos.x + randSigned(sh) * 0.5,
      this._camPos.y + randSigned(sh) * 0.35,
      this._camPos.z + randSigned(sh) * 0.5,
    );
    this.camera.lookAt(this._camLook);
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
