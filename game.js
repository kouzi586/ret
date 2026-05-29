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
    text: "散射型彈幕，移動輕快。",
    colors: ["#39d9ff", "#b6ff5f"],
    speed: 5.6,
    fireRate: 100,
    pattern: "spread",
  },
  {
    name: "摺紙星鯨",
    text: "厚重但穩，雷射穿透力高。",
    colors: ["#8a7dff", "#ffd166"],
    speed: 4.4,
    fireRate: 135,
    pattern: "laser",
  },
  {
    name: "日蝕蝴蝶",
    text: "左右翼彈道會扭曲前進。",
    colors: ["#ff4f8d", "#39d9ff"],
    speed: 5.1,
    fireRate: 115,
    pattern: "wave",
  },
  {
    name: "鏡面新月",
    text: "雙核心火砲，近距離威力強。",
    colors: ["#e8f2ff", "#59ff9f"],
    speed: 4.9,
    fireRate: 95,
    pattern: "twin",
  },
  {
    name: "量子蓮花",
    text: "慢熱型，高火力後會開花。",
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

function drawShip(c, x, y, ship, t, scale = 1) {
  const [a, b] = ship.colors;
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  c.shadowColor = a;
  c.shadowBlur = 14;
  const pulse = Math.sin(t / 120) * 3;

  c.fillStyle = a;
  c.beginPath();
  c.moveTo(0, -27 - pulse);
  c.bezierCurveTo(18, -8, 22, 16, 0, 29);
  c.bezierCurveTo(-22, 16, -18, -8, 0, -27 - pulse);
  c.fill();

  c.fillStyle = b;
  c.beginPath();
  c.moveTo(-8, -6);
  c.lineTo(-35, 12);
  c.lineTo(-8, 21);
  c.closePath();
  c.moveTo(8, -6);
  c.lineTo(35, 12);
  c.lineTo(8, 21);
  c.closePath();
  c.fill();

  c.strokeStyle = "rgba(255,255,255,.85)";
  c.lineWidth = 2;
  c.beginPath();
  c.arc(0, 0, 10 + Math.sin(t / 150) * 2, 0, Math.PI * 2);
  c.stroke();

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
  const base = { x: player.x, y: player.y - 24, damage: 1 + power * 0.24, color: ship.colors[0] };

  const add = (dx, dy, vx, vy, size = 5, wave = 0) => {
    bullets.push({ ...base, x: base.x + dx, y: base.y + dy, vx, vy, r: size, wave, born: now });
  };

  if (ship.pattern === "spread") {
    add(0, 0, 0, -9);
    if (power > 1) { add(-12, 8, -1.9, -8.2); add(12, 8, 1.9, -8.2); }
    if (power > 3) { add(-22, 12, -3, -7.4, 4); add(22, 12, 3, -7.4, 4); }
  } else if (ship.pattern === "laser") {
    add(0, 0, 0, -12, 4 + power);
    if (power > 2) { add(-15, 9, 0, -10, 4); add(15, 9, 0, -10, 4); }
  } else if (ship.pattern === "wave") {
    add(0, 0, 0, -9);
    add(-16, 6, 0, -8.3, 4, -1);
    add(16, 6, 0, -8.3, 4, 1);
    if (power > 3) { add(-28, 14, 0, -7.4, 4, -1.8); add(28, 14, 0, -7.4, 4, 1.8); }
  } else if (ship.pattern === "twin") {
    add(-10, 0, -0.2, -10, 5);
    add(10, 0, 0.2, -10, 5);
    if (power > 2) add(0, -10, 0, -11, 6);
  } else {
    add(0, 0, 0, -9.8, 5);
    if (power > 1) { add(-18, 8, -1, -8.5); add(18, 8, 1, -8.5); }
    if (power > 4) { add(-8, 18, -2.2, -8); add(8, 18, 2.2, -8); }
  }
}

function spawnEnemy(now) {
  const elapsed = (now - startTime) / 1000;
  const gap = Math.max(360, 880 - elapsed * 22);
  if (now - lastEnemy < gap) return;
  lastEnemy = now;
  const type = Math.random();
  const enemy = {
    x: 40 + Math.random() * (W - 80),
    y: -35,
    r: type > 0.82 ? 28 : 19,
    hp: type > 0.82 ? 5 + elapsed * 0.1 : 2 + elapsed * 0.06,
    vx: (Math.random() - 0.5) * 1.8,
    vy: type > 0.82 ? 1.15 : 1.8 + Math.random() * 1.2,
    phase: Math.random() * Math.PI * 2,
    fire: now + 600 + Math.random() * 900,
    bossy: type > 0.82,
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
    b.x += b.vx + Math.sin((now - b.born) / 90) * b.wave;
    b.y += b.vy;
  });
  bullets = bullets.filter((b) => b.y > -40 && b.x > -50 && b.x < W + 50);

  enemies.forEach((e) => {
    e.phase += 0.035;
    e.x += e.vx + Math.sin(e.phase) * (e.bossy ? 1.4 : 0.7);
    e.y += e.vy;
    if (e.x < 25 || e.x > W - 25) e.vx *= -1;
    if (now > e.fire && e.y > 20 && e.y < H - 160) {
      e.fire = now + (e.bossy ? 1050 : 1450);
      const angle = Math.atan2(player.y - e.y, player.x - e.x);
      const speed = e.bossy ? 3.4 : 3;
      enemyBullets.push({ x: e.x, y: e.y + 18, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 6 });
      if (e.bossy) {
        enemyBullets.push({ x: e.x, y: e.y + 18, vx: Math.cos(angle - 0.28) * speed, vy: Math.sin(angle - 0.28) * speed, r: 5 });
        enemyBullets.push({ x: e.x, y: e.y + 18, vx: Math.cos(angle + 0.28) * speed, vy: Math.sin(angle + 0.28) * speed, r: 5 });
      }
    }
  });
  enemies = enemies.filter((e) => e.y < H + 50 && e.hp > 0);

  enemyBullets.forEach((b) => {
    b.x += b.vx;
    b.y += b.vy;
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
      if (hit(b, e)) {
        e.hp -= b.damage;
        b.y = -100;
        explode(b.x, b.y, ship.colors[0], 4);
        if (e.hp <= 0) {
          score += e.bossy ? 320 : 110;
          explode(e.x, e.y, e.bossy ? "#ff4f8d" : "#39d9ff", e.bossy ? 34 : 18);
          updateHud();
        }
        break;
      }
    }
  }

  for (const p of pickups) {
    if (hit(player, p)) {
      if (p.type === "power") power = Math.min(5, power + 1);
      else lives = Math.min(5, lives + 1);
      p.y = H + 100;
      score += 50;
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
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(Math.sin(e.phase) * 0.18);
  ctx.shadowColor = e.bossy ? "#ff4f8d" : "#ffd166";
  ctx.shadowBlur = 12;
  ctx.fillStyle = e.bossy ? "#ff4f8d" : "#ffd166";
  ctx.beginPath();
  const points = e.bossy ? 9 : 6;
  for (let i = 0; i < points; i++) {
    const a = (Math.PI * 2 * i) / points - Math.PI / 2;
    const r = i % 2 ? e.r * 0.48 : e.r;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.58)";
  ctx.stroke();
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

  bullets.forEach((b) => {
    ctx.fillStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.ellipse(b.x, b.y, b.r, b.r * 1.9, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.shadowBlur = 0;

  enemyBullets.forEach((b) => {
    ctx.fillStyle = "#ff6b6b";
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  });

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
