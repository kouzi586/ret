const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const shipGrid = document.getElementById("shipGrid");
const startBtn = document.getElementById("startBtn");
const fireBtn = document.getElementById("fireBtn");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const powerEl = document.getElementById("power");

const W = canvas.width;
const H = canvas.height;
const keys = new Set();
const pointer = { active: false, x: W / 2, y: H - 120 };

const ships = [
  {
    name: "水母光梭",
    text: "發射浮游電漿，範圍廣、清小怪快。",
    colors: ["#39d9ff", "#b6ff5f"],
    speed: 5.6,
    fireRate: 100,
    pattern: "spread",
  },
  {
    name: "摺紙星鯨",
    text: "折線光槍可穿透敵機，單線威力高。",
    colors: ["#8a7dff", "#ffd166"],
    speed: 4.4,
    fireRate: 135,
    pattern: "laser",
  },
  {
    name: "日蝕蝴蝶",
    text: "月牙彈會擺動飛行，夾擊路線靈活。",
    colors: ["#ff4f8d", "#39d9ff"],
    speed: 5.1,
    fireRate: 115,
    pattern: "wave",
  },
  {
    name: "鏡面新月",
    text: "鏡刃命中後碎裂，近距離爆發強。",
    colors: ["#e8f2ff", "#59ff9f"],
    speed: 4.9,
    fireRate: 95,
    pattern: "twin",
  },
  {
    name: "量子蓮花",
    text: "花瓣彈旋轉前進，高火力時綻放彈幕。",
    colors: ["#ff9f1c", "#f5f7ff"],
    speed: 4.7,
    fireRate: 125,
    pattern: "bloom",
  },
];

let selected = 0;
let player;
let bullets = [];
let enemies = [];
let enemyBullets = [];
let particles = [];
let pickups = [];
let stars = [];
let score = 0;
let lives = 3;
let power = 1;
let playing = false;
let paused = false;
let gameOver = false;
let firing = false;
let lastShot = 0;
let lastEnemy = 0;
let lastPickup = 0;
let startTime = 0;
let audioCtx;

const enemyModels = [
  {
    kind: "mask",
    name: "裂面假面",
    colors: ["#ff4f8d", "#ffd166"],
    hp: 2.2,
    speed: 1.9,
    radius: 20,
    fireStyle: "aim",
  },
  {
    kind: "needle",
    name: "針塔幽機",
    colors: ["#39d9ff", "#e8f2ff"],
    hp: 1.8,
    speed: 2.4,
    radius: 17,
    fireStyle: "fast",
  },
  {
    kind: "orb",
    name: "眼核巡航",
    colors: ["#b6ff5f", "#8a7dff"],
    hp: 3.2,
    speed: 1.5,
    radius: 23,
    fireStyle: "spread",
  },
  {
    kind: "manta",
    name: "緋翼魟艦",
    colors: ["#ff9f1c", "#59ff9f"],
    hp: 6,
    speed: 1.05,
    radius: 30,
    fireStyle: "trident",
    bossy: true,
  },
];

function makeStars() {
  stars = Array.from({ length: 120 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    r: Math.random() * 1.8 + 0.3,
    s: Math.random() * 2.4 + 0.8,
    hue: Math.random() * 70 + 180,
  }));
}

function renderShipIcon(canvasEl, ship, scale = 1) {
  const c = canvasEl.getContext("2d");
  const w = canvasEl.width;
  const h = canvasEl.height;
  c.clearRect(0, 0, w, h);
  c.save();
  c.translate(w / 2, h / 2);
  c.scale(scale, scale);
  drawShip(c, 0, 0, ship, 0, 1);
  c.restore();
}

function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function tone(freq, duration, type = "sine", volume = 0.08, slideTo = freq) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.03);
}

function noise(duration, volume = 0.1, lowpass = 900) {
  if (!audioCtx) return;
  const samples = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
  const buffer = audioCtx.createBuffer(1, samples, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i++) {
    const fade = 1 - i / samples;
    data[i] = (Math.random() * 2 - 1) * fade * fade;
  }
  const source = audioCtx.createBufferSource();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();
  filter.type = "lowpass";
  filter.frequency.value = lowpass;
  gain.gain.value = volume;
  source.buffer = buffer;
  source.connect(filter).connect(gain).connect(audioCtx.destination);
  source.start();
}

function playShootSound(pattern) {
  const sound = {
    spread: [760, 0.055, "triangle", 0.045, 420],
    laser: [980, 0.09, "sawtooth", 0.04, 680],
    wave: [620, 0.07, "sine", 0.05, 920],
    twin: [520, 0.06, "square", 0.04, 300],
    bloom: [700, 0.08, "triangle", 0.04, 1180],
  }[pattern] || [700, 0.06, "triangle", 0.04, 450];
  tone(...sound);
}

function playEnemyShotSound(style) {
  const freq = style === "spread" ? 280 : style === "trident" ? 220 : 340;
  tone(freq, 0.055, "square", 0.025, freq * 0.7);
}

function playHitSound() {
  tone(160, 0.045, "triangle", 0.045, 90);
}

function playExplosionSound(big = false) {
  noise(big ? 0.5 : 0.25, big ? 0.2 : 0.12, big ? 520 : 850);
  tone(big ? 95 : 135, big ? 0.42 : 0.22, "sawtooth", big ? 0.13 : 0.08, 32);
  tone(big ? 240 : 310, 0.08, "square", 0.035, 80);
}

function playPickupSound() {
  tone(520, 0.06, "sine", 0.05, 880);
  setTimeout(() => tone(780, 0.08, "sine", 0.04, 1180), 45);
}

function drawShip(c, x, y, ship, t, scale = 1) {
  const [a, b] = ship.colors;
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  c.shadowColor = a;
  c.shadowBlur = 16;
  const pulse = Math.sin(t / 120) * 3;
  const wing = Math.sin(t / 180) * 3;

  if (ship.pattern === "spread") {
    c.fillStyle = "rgba(57,217,255,.22)";
    for (let i = 0; i < 6; i++) {
      c.beginPath();
      c.ellipse(0, 14 + i * 4, 18 - i * 2, 7, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = a;
    c.beginPath();
    c.ellipse(0, -3, 18 + wing, 28 + pulse, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = b;
    c.beginPath();
    c.ellipse(0, -4, 9, 17, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "rgba(255,255,255,.9)";
    c.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      c.beginPath();
      c.moveTo(i * 7, 18);
      c.quadraticCurveTo(i * 10 + Math.sin(t / 180 + i) * 5, 32, i * 6, 45);
      c.stroke();
    }
  } else if (ship.pattern === "laser") {
    c.fillStyle = a;
    c.beginPath();
    c.moveTo(0, -34 - pulse);
    c.lineTo(24, -4);
    c.lineTo(15, 28);
    c.lineTo(0, 36);
    c.lineTo(-15, 28);
    c.lineTo(-24, -4);
    c.closePath();
    c.fill();
    c.fillStyle = "rgba(255,255,255,.28)";
    c.beginPath();
    c.moveTo(0, -28);
    c.lineTo(12, 4);
    c.lineTo(0, 27);
    c.lineTo(-12, 4);
    c.closePath();
    c.fill();
    c.strokeStyle = b;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-31, 13);
    c.lineTo(-8, -2);
    c.lineTo(0, -24);
    c.lineTo(8, -2);
    c.lineTo(31, 13);
    c.stroke();
  } else if (ship.pattern === "wave") {
    c.fillStyle = a;
    c.beginPath();
    c.ellipse(-16, 4, 22 + wing, 11, -0.55, 0, Math.PI * 2);
    c.ellipse(16, 4, 22 + wing, 11, 0.55, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = b;
    c.beginPath();
    c.arc(0, -8, 17, Math.PI * 0.1, Math.PI * 0.9, true);
    c.arc(0, -8, 7, Math.PI * 0.9, Math.PI * 0.1, false);
    c.closePath();
    c.fill();
    c.fillStyle = a;
    c.beginPath();
    c.moveTo(0, -32 - pulse);
    c.quadraticCurveTo(12, -2, 0, 27);
    c.quadraticCurveTo(-12, -2, 0, -32 - pulse);
    c.fill();
  } else if (ship.pattern === "twin") {
    c.strokeStyle = a;
    c.lineWidth = 9;
    c.lineCap = "round";
    c.beginPath();
    c.arc(-13, -2, 27, -1.35, 1.55);
    c.arc(13, -2, 27, Math.PI - 1.55, Math.PI + 1.35);
    c.stroke();
    c.fillStyle = b;
    c.beginPath();
    c.moveTo(0, -31 - pulse);
    c.lineTo(12, 19);
    c.lineTo(0, 32);
    c.lineTo(-12, 19);
    c.closePath();
    c.fill();
    c.fillStyle = "rgba(255,255,255,.9)";
    c.beginPath();
    c.arc(-10, 3, 6, 0, Math.PI * 2);
    c.arc(10, 3, 6, 0, Math.PI * 2);
    c.fill();
  } else {
    c.fillStyle = a;
    for (let i = 0; i < 8; i++) {
      c.save();
      c.rotate((Math.PI * 2 * i) / 8 + t / 1100);
      c.beginPath();
      c.ellipse(0, -17 - pulse * 0.25, 8, 24, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    c.fillStyle = b;
    c.beginPath();
    c.arc(0, 0, 14 + Math.sin(t / 160) * 2, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "rgba(255,255,255,.85)";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, 0, 23, 0, Math.PI * 2);
    c.stroke();
  }

  c.restore();
}

function buildSelector() {
  ships.forEach((ship, i) => {
    const btn = document.createElement("button");
    btn.className = `ship-option${i === selected ? " active" : ""}`;
    btn.type = "button";
    const preview = document.createElement("canvas");
    preview.className = "ship-preview";
    preview.width = 72;
    preview.height = 72;
    const copy = document.createElement("div");
    copy.innerHTML = `<strong class="ship-name">${ship.name}</strong><p class="ship-text">${ship.text}</p>`;
    btn.append(preview, copy);
    btn.addEventListener("click", () => {
      selected = i;
      document.querySelectorAll(".ship-option").forEach((el) => el.classList.remove("active"));
      btn.classList.add("active");
    });
    shipGrid.append(btn);
    renderShipIcon(preview, ship, 0.86);
  });
}

function resetGame() {
  player = {
    x: W / 2,
    y: H - 95,
    r: 20,
    invincible: 1500,
  };
  bullets = [];
  enemies = [];
  enemyBullets = [];
  particles = [];
  pickups = [];
  score = 0;
  lives = 3;
  power = 1;
  gameOver = false;
  paused = false;
  startTime = performance.now();
  lastShot = 0;
  lastEnemy = 0;
  lastPickup = 0;
  updateHud();
}

function startGame() {
  initAudio();
  resetGame();
  overlay.classList.add("hidden");
  playing = true;
}

function updateHud() {
  scoreEl.textContent = String(score);
  livesEl.textContent = String(lives);
  powerEl.textContent = String(power);
}

function shoot(now) {
  const ship = ships[selected];
  const rate = Math.max(54, ship.fireRate - power * 9);
  if (now - lastShot < rate) return;
  lastShot = now;
  playShootSound(ship.pattern);
  const base = { x: player.x, y: player.y - 24, damage: 1 + power * 0.24, color: ship.colors[0], color2: ship.colors[1] };

  const add = (dx, dy, vx, vy, size = 5, wave = 0, extra = {}) => {
    bullets.push({
      ...base,
      x: base.x + dx,
      y: base.y + dy,
      vx,
      vy,
      r: size,
      wave,
      born: now,
      spin: Math.random() * Math.PI * 2,
      ...extra,
    });
  };

  if (ship.pattern === "spread") {
    add(0, 0, 0, -8.7, 6, 0, { kind: "plasma", splash: 8, damage: 0.9 + power * 0.2 });
    if (power > 1) { add(-12, 8, -1.6, -8, 5, 0, { kind: "plasma", splash: 7 }); add(12, 8, 1.6, -8, 5, 0, { kind: "plasma", splash: 7 }); }
    if (power > 3) { add(-24, 13, -2.9, -7.2, 4, 0, { kind: "plasma", splash: 6 }); add(24, 13, 2.9, -7.2, 4, 0, { kind: "plasma", splash: 6 }); }
  } else if (ship.pattern === "laser") {
    add(0, 0, 0, -13, 4 + power, 0, { kind: "spear", length: 34 + power * 5, pierce: 1 + Math.floor(power / 2), damage: 1.25 + power * 0.34 });
    if (power > 2) { add(-15, 9, 0, -10.8, 4, 0, { kind: "fold", pierce: 1, damage: 0.8 + power * 0.18 }); add(15, 9, 0, -10.8, 4, 0, { kind: "fold", pierce: 1, damage: 0.8 + power * 0.18 }); }
  } else if (ship.pattern === "wave") {
    add(0, 0, 0, -9.2, 5, 0, { kind: "eclipse", damage: 1 + power * 0.22 });
    add(-16, 6, 0, -8.4, 5, -1.25, { kind: "crescent", damage: 0.85 + power * 0.2 });
    add(16, 6, 0, -8.4, 5, 1.25, { kind: "crescent", damage: 0.85 + power * 0.2 });
    if (power > 3) { add(-29, 14, 0, -7.6, 4, -2.1, { kind: "crescent" }); add(29, 14, 0, -7.6, 4, 2.1, { kind: "crescent" }); }
  } else if (ship.pattern === "twin") {
    add(-10, 0, -0.25, -10, 6, 0, { kind: "mirror", split: true, damage: 1.05 + power * 0.25 });
    add(10, 0, 0.25, -10, 6, 0, { kind: "mirror", split: true, damage: 1.05 + power * 0.25 });
    if (power > 2) add(0, -10, 0, -11.2, 7, 0, { kind: "mirrorCore", split: true, damage: 1.3 + power * 0.28 });
  } else {
    add(0, 0, 0, -9.6, 6, 0, { kind: "seed", damage: 1.05 + power * 0.25 });
    if (power > 1) { add(-18, 8, -0.8, -8.5, 5, 0, { kind: "petal", orbit: -1 }); add(18, 8, 0.8, -8.5, 5, 0, { kind: "petal", orbit: 1 }); }
    if (power > 4) { add(-8, 18, -2.1, -8, 5, 0, { kind: "petal", orbit: -2 }); add(8, 18, 2.1, -8, 5, 0, { kind: "petal", orbit: 2 }); }
  }
}

function spawnEnemy(now) {
  const elapsed = (now - startTime) / 1000;
  const gap = Math.max(360, 880 - elapsed * 22);
  if (now - lastEnemy < gap) return;
  lastEnemy = now;
  const model = enemyModels[Math.floor(Math.random() * enemyModels.length)];
  const isBossy = model.bossy || Math.random() > 0.84;
  const enemy = {
    x: 40 + Math.random() * (W - 80),
    y: -35,
    r: isBossy ? Math.max(28, model.radius + 5) : model.radius,
    hp: model.hp + elapsed * (isBossy ? 0.13 : 0.06),
    vx: (Math.random() - 0.5) * 1.8,
    vy: model.speed + Math.random() * (isBossy ? 0.35 : 0.8),
    phase: Math.random() * Math.PI * 2,
    fire: now + 600 + Math.random() * 900,
    kind: model.kind,
    colors: model.colors,
    fireStyle: model.fireStyle,
    bossy: isBossy,
  };
  enemies.push(enemy);
}

function spawnPickup(now) {
  if (now - lastPickup < 7800) return;
  lastPickup = now;
  pickups.push({
    x: 35 + Math.random() * (W - 70),
    y: -20,
    r: 13,
    vy: 2.2,
    type: Math.random() > 0.28 ? "power" : "life",
  });
}

function explode(x, y, color, count = 18) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = Math.random() * 4 + 1;
    particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 34 + Math.random() * 28,
      color,
    });
  }
}

function hit(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const rr = a.r + b.r;
  return dx * dx + dy * dy < rr * rr;
}

function update(now) {
  if (!playing || paused || gameOver) return;
  const ship = ships[selected];
  const left = keys.has("ArrowLeft") || keys.has("a");
  const right = keys.has("ArrowRight") || keys.has("d");
  const up = keys.has("ArrowUp") || keys.has("w");
  const down = keys.has("ArrowDown") || keys.has("s");
  player.x += (right - left) * ship.speed;
  player.y += (down - up) * ship.speed;
  if (pointer.active) {
    player.x += (pointer.x - player.x) * 0.18;
    player.y += (pointer.y - player.y) * 0.18;
  }
  player.x = Math.max(24, Math.min(W - 24, player.x));
  player.y = Math.max(54, Math.min(H - 34, player.y));
  if (keys.has(" ") || pointer.active || firing) shoot(now);

  spawnEnemy(now);
  spawnPickup(now);

  stars.forEach((s) => {
    s.y += s.s;
    if (s.y > H) {
      s.y = -4;
      s.x = Math.random() * W;
    }
  });

  bullets.forEach((b) => {
    const age = now - b.born;
    const orbit = b.orbit ? Math.sin(age / 95 + b.orbit) * Math.abs(b.orbit) * 0.42 : 0;
    const zigzag = b.kind === "fold" ? Math.sign(Math.sin(age / 70)) * 0.45 : 0;
    b.x += b.vx + Math.sin(age / 90) * b.wave + orbit + zigzag;
    b.y += b.vy;
    b.spin += b.kind === "mirror" || b.kind === "petal" ? 0.18 : 0.06;
    if ((b.kind === "plasma" || b.kind === "seed") && Math.random() < 0.25) {
      particles.push({
        x: b.x,
        y: b.y + b.r,
        vx: (Math.random() - 0.5) * 0.8,
        vy: Math.random() * 1.2,
        life: 16,
        color: b.color2,
      });
    }
  });
  bullets = bullets.filter((b) => !b.dead && b.y > -60 && b.x > -60 && b.x < W + 60);

  enemies.forEach((e) => {
    e.phase += 0.035;
    e.x += e.vx + Math.sin(e.phase) * (e.bossy ? 1.4 : 0.7);
    e.y += e.vy;
    if (e.x < 25 || e.x > W - 25) e.vx *= -1;
    if (now > e.fire && e.y > 20 && e.y < H - 160) {
      e.fire = now + (e.bossy ? 1050 : 1450);
      const angle = Math.atan2(player.y - e.y, player.x - e.x);
      const speed = e.fireStyle === "fast" ? 3.8 : e.bossy ? 3.4 : 3;
      const [c1, c2] = e.colors || ["#ff6b6b", "#ffd166"];
      const pushEnemyShot = (a, r = 6, style = e.fireStyle) => {
        enemyBullets.push({
          x: e.x,
          y: e.y + 18,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          r,
          color: c1,
          color2: c2,
          style,
          spin: 0,
        });
      };
      playEnemyShotSound(e.fireStyle);
      if (e.fireStyle === "spread") {
        pushEnemyShot(angle - 0.35, 5);
        pushEnemyShot(angle, 6);
        pushEnemyShot(angle + 0.35, 5);
      } else if (e.fireStyle === "trident") {
        pushEnemyShot(angle - 0.42, 5);
        pushEnemyShot(angle, 7, "heavy");
        pushEnemyShot(angle + 0.42, 5);
      } else {
        pushEnemyShot(angle, e.fireStyle === "fast" ? 4.5 : 6);
      }
      if (e.bossy && e.fireStyle !== "trident") {
        pushEnemyShot(angle - 0.28, 5);
        pushEnemyShot(angle + 0.28, 5);
      }
    }
  });
  enemies = enemies.filter((e) => e.y < H + 50 && e.hp > 0);

  enemyBullets.forEach((b) => {
    b.x += b.vx;
    b.y += b.vy;
    b.spin += b.style === "heavy" ? 0.04 : 0.13;
  });
  enemyBullets = enemyBullets.filter((b) => b.y < H + 30 && b.x > -30 && b.x < W + 30);

  pickups.forEach((p) => p.y += p.vy);
  pickups = pickups.filter((p) => p.y < H + 30);

  particles.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.life -= 1;
  });
  particles = particles.filter((p) => p.life > 0);

  for (const b of bullets) {
    for (const e of enemies) {
      b.hitTargets ||= new WeakSet();
      if (!b.hitTargets.has(e) && hit(b, e)) {
        b.hitTargets.add(e);
        e.hp -= b.damage;
        playHitSound();
        if (b.splash) explode(b.x, b.y, b.color2, b.splash);
        else explode(b.x, b.y, b.color, 4);
        if (b.split && power > 1) {
          for (const dir of [-1, 1]) {
            bullets.push({
              x: b.x,
              y: b.y,
              vx: dir * 3.1,
              vy: -6.6,
              r: 3.5,
              damage: 0.45 + power * 0.08,
              color: b.color2,
              color2: b.color,
              kind: "shard",
              wave: 0,
              born: now,
              spin: dir,
            });
          }
        }
        if (b.pierce > 0) b.pierce -= 1;
        else b.dead = true;
        if (e.hp <= 0) {
          score += e.bossy ? 320 : 110;
          playExplosionSound(e.bossy);
          explode(e.x, e.y, e.bossy ? "#ff4f8d" : "#39d9ff", e.bossy ? 34 : 18);
          updateHud();
        }
        break;
      }
    }
  }
  bullets = bullets.filter((b) => !b.dead);

  for (const p of pickups) {
    if (hit(player, p)) {
      if (p.type === "power") power = Math.min(5, power + 1);
      else lives = Math.min(5, lives + 1);
      p.y = H + 100;
      score += 50;
      playPickupSound();
      explode(player.x, player.y, p.type === "power" ? "#b6ff5f" : "#ffd166", 16);
      updateHud();
    }
  }

  if (now > player.invincible) {
    const danger = enemies.find((e) => hit(player, e)) || enemyBullets.find((b) => hit(player, b));
    if (danger) {
      lives -= 1;
      power = Math.max(1, power - 1);
      player.invincible = now + 1600;
      playExplosionSound(true);
      explode(player.x, player.y, "#f5f7ff", 28);
      enemies = enemies.filter((e) => !hit(player, e));
      enemyBullets = enemyBullets.filter((b) => !hit(player, b));
      updateHud();
      if (lives <= 0) endGame();
    }
  }
}

function endGame() {
  gameOver = true;
  playing = false;
  overlay.classList.remove("hidden");
  overlay.querySelector(".kicker").textContent = "Mission Complete";
  overlay.querySelector("h1").textContent = "任務結束";
  overlay.querySelector(".intro").textContent = `分數 ${score}。換一台夢境戰機再飛一次。`;
  startBtn.textContent = "重新出擊";
}

function drawEnemy(e, now) {
  const [a, b] = e.colors || ["#ff4f8d", "#ffd166"];
  const pulse = Math.sin(now / 170 + e.phase) * 2;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(Math.sin(e.phase) * 0.18);
  ctx.shadowColor = a;
  ctx.shadowBlur = e.bossy ? 20 : 13;

  if (e.kind === "needle") {
    ctx.fillStyle = a;
    ctx.beginPath();
    ctx.moveTo(0, 30 + pulse);
    ctx.lineTo(12, -8);
    ctx.lineTo(0, -32 - pulse);
    ctx.lineTo(-12, -8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = b;
    ctx.beginPath();
    ctx.moveTo(-24, 7);
    ctx.lineTo(-7, -4);
    ctx.lineTo(-4, 15);
    ctx.closePath();
    ctx.moveTo(24, 7);
    ctx.lineTo(7, -4);
    ctx.lineTo(4, 15);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.72)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else if (e.kind === "orb") {
    ctx.fillStyle = "rgba(182,255,95,.18)";
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 8 + pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = a;
    ctx.beginPath();
    ctx.arc(0, 0, e.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#050714";
    ctx.beginPath();
    ctx.arc(3, -2, e.r * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = b;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 4, now / 260, now / 260 + Math.PI * 1.35);
    ctx.stroke();
  } else if (e.kind === "manta") {
    ctx.fillStyle = a;
    ctx.beginPath();
    ctx.moveTo(0, -27 - pulse);
    ctx.bezierCurveTo(36, -15, 43, 15, 10, 24);
    ctx.lineTo(0, 35);
    ctx.lineTo(-10, 24);
    ctx.bezierCurveTo(-43, 15, -36, -15, 0, -27 - pulse);
    ctx.fill();
    ctx.fillStyle = b;
    ctx.beginPath();
    ctx.moveTo(-8, -5);
    ctx.lineTo(0, 18);
    ctx.lineTo(8, -5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.68)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-31, 8);
    ctx.quadraticCurveTo(0, -13, 31, 8);
    ctx.stroke();
  } else {
    ctx.fillStyle = a;
    ctx.beginPath();
    ctx.moveTo(0, -28 - pulse);
    ctx.lineTo(24, -9);
    ctx.lineTo(16, 24);
    ctx.lineTo(0, 14);
    ctx.lineTo(-16, 24);
    ctx.lineTo(-24, -9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#050714";
    ctx.beginPath();
    ctx.arc(0, -5, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = b;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-18, 4);
    ctx.lineTo(18, 4);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPlayerBullet(b, now) {
  const age = now - b.born;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.spin || 0);
  ctx.shadowColor = b.color;
  ctx.shadowBlur = 14;

  if (b.kind === "spear") {
    const len = b.length || 42;
    const beam = ctx.createLinearGradient(0, len * 0.45, 0, -len);
    beam.addColorStop(0, "rgba(255,255,255,.18)");
    beam.addColorStop(0.35, b.color);
    beam.addColorStop(1, b.color2);
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(0, -len);
    ctx.lineTo(7, -8);
    ctx.lineTo(3, len * 0.45);
    ctx.lineTo(-3, len * 0.45);
    ctx.lineTo(-7, -8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.75)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else if (b.kind === "fold") {
    ctx.fillStyle = b.color2;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(10, -2);
    ctx.lineTo(1, 14);
    ctx.lineTo(-8, 0);
    ctx.closePath();
    ctx.fill();
  } else if (b.kind === "crescent") {
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(0, 0, b.r + 7, -0.25, Math.PI * 1.25);
    ctx.arc(-5, 0, b.r + 4, Math.PI * 1.25, -0.25, true);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = b.color2;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (b.kind === "eclipse") {
    ctx.fillStyle = b.color2;
    ctx.beginPath();
    ctx.arc(0, 0, b.r + 4 + Math.sin(age / 90), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#050714";
    ctx.beginPath();
    ctx.arc(4, -2, b.r + 1, 0, Math.PI * 2);
    ctx.fill();
  } else if (b.kind === "mirror" || b.kind === "mirrorCore" || b.kind === "shard") {
    ctx.fillStyle = b.kind === "mirrorCore" ? b.color2 : b.color;
    ctx.beginPath();
    ctx.moveTo(0, -b.r * 2.5);
    ctx.lineTo(b.r * 1.4, 0);
    ctx.lineTo(0, b.r * 2.5);
    ctx.lineTo(-b.r * 1.4, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.82)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else if (b.kind === "seed") {
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(0, 0, b.r + Math.sin(age / 80) * 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = b.color2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, b.r + 7, 0, Math.PI * 2);
    ctx.stroke();
  } else if (b.kind === "petal") {
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, b.r, b.r * 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = b.color2;
    ctx.beginPath();
    ctx.ellipse(0, -1, b.r * 0.38, b.r * 1.25, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const orb = ctx.createRadialGradient(0, 0, 1, 0, 0, b.r * 2.2);
    orb.addColorStop(0, "#fff");
    orb.addColorStop(0.38, b.color);
    orb.addColorStop(1, "rgba(57,217,255,0)");
    ctx.fillStyle = orb;
    ctx.beginPath();
    ctx.arc(0, 0, b.r * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = b.color2;
    ctx.beginPath();
    ctx.arc(0, 0, b.r * 0.72, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawEnemyBullet(b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.spin || 0);
  ctx.shadowColor = b.color || "#ff6b6b";
  ctx.shadowBlur = 12;

  if (b.style === "fast") {
    ctx.fillStyle = b.color2 || "#ffd166";
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(5, 10);
    ctx.lineTo(0, 17);
    ctx.lineTo(-5, 10);
    ctx.closePath();
    ctx.fill();
  } else if (b.style === "heavy") {
    ctx.fillStyle = b.color || "#ff6b6b";
    ctx.beginPath();
    ctx.arc(0, 0, b.r + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = b.color2 || "#ffd166";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, b.r + 9, 0, Math.PI * 1.55);
    ctx.stroke();
  } else if (b.style === "spread") {
    ctx.fillStyle = b.color || "#ff6b6b";
    ctx.beginPath();
    ctx.moveTo(0, -b.r * 1.8);
    ctx.lineTo(b.r * 1.6, 0);
    ctx.lineTo(0, b.r * 1.8);
    ctx.lineTo(-b.r * 1.6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.55)";
    ctx.stroke();
  } else {
    const orb = ctx.createRadialGradient(0, 0, 1, 0, 0, b.r * 2);
    orb.addColorStop(0, "#fff");
    orb.addColorStop(0.45, b.color || "#ff6b6b");
    orb.addColorStop(1, "rgba(255,107,107,0)");
    ctx.fillStyle = orb;
    ctx.beginPath();
    ctx.arc(0, 0, b.r * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function draw(now) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#050714");
  bg.addColorStop(0.52, "#101438");
  bg.addColorStop(1, "#160817");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  stars.forEach((s) => {
    ctx.fillStyle = `hsla(${s.hue}, 100%, 78%, ${0.35 + s.r * 0.18})`;
    ctx.fillRect(s.x, s.y, s.r, s.r * 3.2);
  });

  ctx.save();
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 8; i++) {
    ctx.strokeStyle = i % 2 ? "#39d9ff" : "#ff4f8d";
    ctx.beginPath();
    ctx.moveTo(0, (now / 28 + i * 100) % (H + 140) - 140);
    ctx.bezierCurveTo(W * 0.25, 120 + i * 70, W * 0.68, 240 + i * 22, W, 70 + i * 92);
    ctx.stroke();
  }
  ctx.restore();

  pickups.forEach((p) => {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(now / 350);
    ctx.fillStyle = p.type === "power" ? "#b6ff5f" : "#ffd166";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 16;
    ctx.fillRect(-10, -10, 20, 20);
    ctx.fillStyle = "#050714";
    ctx.font = "bold 15px Segoe UI";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.type === "power" ? "P" : "+", 0, 1);
    ctx.restore();
  });

  enemies.forEach((e) => drawEnemy(e, now));

  bullets.forEach((b) => drawPlayerBullet(b, now));
  ctx.shadowBlur = 0;

  enemyBullets.forEach((b) => drawEnemyBullet(b));

  particles.forEach((p) => {
    ctx.globalAlpha = Math.max(0, p.life / 55);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 3, 3);
  });
  ctx.globalAlpha = 1;

  if (player) {
    if (!playing || now > player.invincible || Math.floor(now / 90) % 2 === 0) {
      drawShip(ctx, player.x, player.y, ships[selected], now, 1);
    }
  }

  if (paused) {
    ctx.fillStyle = "rgba(5,7,20,.62)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#f5f7ff";
    ctx.font = "bold 38px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText("暫停", W / 2, H / 2);
  }
}

function loop(now) {
  update(now);
  draw(now);
  requestAnimationFrame(loop);
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const touch = event.touches ? event.touches[0] : event;
  return {
    x: ((touch.clientX - rect.left) / rect.width) * W,
    y: ((touch.clientY - rect.top) / rect.height) * H,
  };
}

window.addEventListener("keydown", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  keys.add(key);
  if (key === "p" && playing) paused = !paused;
  if (key === "r") startGame();
  if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) event.preventDefault();
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key);
});

canvas.addEventListener("pointerdown", (event) => {
  initAudio();
  pointer.active = true;
  Object.assign(pointer, canvasPoint(event));
});
canvas.addEventListener("pointermove", (event) => {
  if (pointer.active) Object.assign(pointer, canvasPoint(event));
});
window.addEventListener("pointerup", () => {
  pointer.active = false;
});

function setFiring(active) {
  firing = active;
  fireBtn.classList.toggle("firing", active);
}

fireBtn.addEventListener("pointerdown", (event) => {
  initAudio();
  event.preventDefault();
  event.stopPropagation();
  setFiring(true);
});
fireBtn.addEventListener("pointerup", (event) => {
  event.preventDefault();
  setFiring(false);
});
fireBtn.addEventListener("pointercancel", () => setFiring(false));
fireBtn.addEventListener("pointerleave", () => setFiring(false));

startBtn.addEventListener("click", startGame);

buildSelector();
makeStars();
resetGame();
requestAnimationFrame(loop);
