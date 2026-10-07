// Draws the live "Agentic Vision" Android app UI onto a canvas that is used as
// the phone-screen texture in the 3D scene. Each pipeline stage has its own view.

const W = 720, H = 1480;
const FEED = { x: 24, y: 214, w: 672, h: 502 };
const IMG_W = 1200, IMG_H = 896;

// Normalised boxes on public/img/street.jpg
const OBJ = [
  { cls: 'motorbike', conf: 0.94, box: [0.745, 0.363, 0.958, 0.848], dist: 1.2, ang: 30, vel: 2.4, mot: 'approaching', col: '#ff4d6d', threat: true },
  { cls: 'auto-rickshaw', conf: 0.91, box: [0.160, 0.374, 0.354, 0.658], dist: 3.1, ang: -24, vel: 0, mot: 'static', col: '#fbbf24' },
  { cls: 'person', conf: 0.89, box: [0.404, 0.390, 0.468, 0.616], dist: 4.8, ang: -6, vel: 0.9, mot: 'walking away', col: '#34d399' },
  { cls: 'car', conf: 0.87, box: [0.604, 0.388, 0.754, 0.522], dist: 9.5, ang: 14, vel: 0, mot: 'static', col: '#22d3ee' },
  { cls: 'person', conf: 0.82, box: [0.060, 0.368, 0.117, 0.567], dist: 5.6, ang: -40, vel: 0, mot: 'static', col: '#34d399' },
  { cls: 'motorbike', conf: 0.78, box: [0.523, 0.385, 0.557, 0.491], dist: 14, ang: 4, vel: 3.1, mot: 'approaching', col: '#fb923c' },
];
const GOAL = { box: [0.62, 0.30, 0.746, 0.393] };

const STAGES = [
  ['CONTINUOUS INPUT', '4× IMX708 · ToF · IMU'],
  ['OBJECT DETECTION', 'YOLOv10-n · TensorRT'],
  ['DEPTH ESTIMATION', 'MiDaS v3.1 + VL53L5CX'],
  ['SCENE FUSION', '3D scene graph'],
  ['TRAJECTORY PREDICTION', 'Kalman filter · 3 s'],
  ['AGENTIC REASONING', 'Phi-3 Mini · INT4'],
  ['SPEECH OUTPUT', 'On-device TTS'],
];

const F = (w, s, fam = 'Inter') => `${w} ${s}px ${fam}, system-ui, sans-serif`;
const MONO = (w, s) => `${w} ${s}px 'JetBrains Mono', ui-monospace, monospace`;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (t) => 1 - Math.pow(1 - clamp(t), 3);

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function inferno(t) {
  const s = [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]];
  t = clamp(t) * (s.length - 1);
  const i = Math.min(s.length - 2, Math.floor(t)), f = t - i;
  return s[i].map((v, k) => v + (s[i + 1][k] - v) * f);
}

export class PhoneScreen {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.img = new Image();
    this.ready = false;
    this.img.onload = () => { this._buildDepth(); this.ready = true; };
    this.img.src = `${import.meta.env.BASE_URL || './'}img/street.jpg`;
    this.stage = -1; this.t0 = 0; this.frac = 0;
    this.stageProgress = 0;
  }

  setStage(s) {
    const i = Math.max(0, Math.min(6, Math.floor(s)));
    if (i !== this.stage) {
      this.stage = i;
      this.t0 = performance.now();
    }
    this.stageProgress = s;
    this.frac = clamp(s - i);
  }

  // feed-space helpers (image is drawn to fill FEED, cropping the 4:3 image to the feed aspect)
  fx(nx) { return FEED.x + nx * FEED.w; }
  fy(ny) { return FEED.y + ny * FEED.h; }

  _buildDepth() {
    const w = 300, h = 224;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const id = g.createImageData(w, h);
    const hz = 0.37;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = x / w, ny = y / h;
        let near; // 1 = near, 0 = far
        if (ny > hz) near = Math.pow((ny - hz) / (1 - hz), 0.8) * 0.85 + 0.05;
        else near = 0.04 + Math.pow(Math.abs(nx - 0.55) * 1.9, 2.2) * 0.55 * (1 - ny * 0.4);
        // side buildings closer
        if (ny < 0.75 && (nx < 0.25 || nx > 0.82)) near = Math.max(near, 0.32 + Math.abs(nx - 0.55) * 0.5 - ny * 0.1);
        for (const o of OBJ) {
          const [x0, y0, x1, y1] = o.box;
          if (nx > x0 && nx < x1 && ny > y0 && ny < y1) near = Math.max(near, clamp(1.02 - Math.log(1 + o.dist) / Math.log(17)));
        }
        const [r, gg, b] = inferno(near);
        const k = (y * w + x) * 4;
        id.data[k] = r; id.data[k + 1] = gg; id.data[k + 2] = b; id.data[k + 3] = 255;
      }
    }
    g.putImageData(id, 0, 0);
    this.depth = c;
  }

  _feed(ctx, alpha = 1, dim = 0) {
    ctx.save();
    rr(ctx, FEED.x, FEED.y, FEED.w, FEED.h, 26); ctx.clip();
    ctx.globalAlpha = alpha;
    // image 4:3 (1.339) vs feed 1.339 -> draw directly
    ctx.drawImage(this.img, FEED.x, FEED.y, FEED.w, FEED.h);
    if (dim) { ctx.fillStyle = `rgba(3,6,12,${dim})`; ctx.fillRect(FEED.x, FEED.y, FEED.w, FEED.h); }
    ctx.restore();
  }

  _box(ctx, o, t, label, sub, appear = 1) {
    const [x0, y0, x1, y1] = o.box;
    const j = Math.sin(t * 3 + x0 * 20) * 1.2;
    const X0 = this.fx(x0) + j, Y0 = this.fy(y0) + j, X1 = this.fx(x1) - j, Y1 = this.fy(y1) - j;
    const w = X1 - X0, h = Y1 - Y0, L = Math.min(18, w * 0.3, h * 0.3);
    ctx.save();
    ctx.globalAlpha = appear;
    ctx.strokeStyle = o.col; ctx.lineWidth = 2;
    ctx.fillStyle = o.col + '18'; ctx.fillRect(X0, Y0, w, h);
    ctx.globalAlpha = appear * 0.55; ctx.strokeRect(X0, Y0, w, h);
    ctx.globalAlpha = appear; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(X0, Y0 + L); ctx.lineTo(X0, Y0); ctx.lineTo(X0 + L, Y0);
    ctx.moveTo(X1 - L, Y0); ctx.lineTo(X1, Y0); ctx.lineTo(X1, Y0 + L);
    ctx.moveTo(X1, Y1 - L); ctx.lineTo(X1, Y1); ctx.lineTo(X1 - L, Y1);
    ctx.moveTo(X0 + L, Y1); ctx.lineTo(X0, Y1); ctx.lineTo(X0, Y1 - L);
    ctx.stroke();
    if (label) {
      ctx.font = F(600, 17);
      const tw = Math.max(ctx.measureText(label).width, sub ? (ctx.font = MONO(500, 14), ctx.measureText(sub).width) : 0) + 16;
      const lh = sub ? 46 : 26;
      let lx = X0, ly = Y0 - lh - 4;
      if (ly < FEED.y + 4) ly = Y0 + 4;
      if (lx + tw > FEED.x + FEED.w - 4) lx = FEED.x + FEED.w - 4 - tw;
      ctx.fillStyle = o.col; rr(ctx, lx, ly, tw, lh, 6); ctx.fill();
      ctx.fillStyle = '#05080f'; ctx.font = F(700, 17); ctx.fillText(label, lx + 8, ly + 19);
      if (sub) { ctx.font = MONO(600, 14); ctx.fillText(sub, lx + 8, ly + 39); }
    }
    ctx.restore();
  }

  _radar(ctx, cx, cy, R, t, mode) {
    ctx.save();
    // rings
    ctx.strokeStyle = 'rgba(120,200,255,.16)'; ctx.lineWidth = 1.5;
    for (let i = 1; i <= 4; i++) { ctx.beginPath(); ctx.arc(cx, cy, (R * i) / 4, 0, Math.PI * 2); ctx.stroke(); }
    ctx.font = MONO(400, 13); ctx.fillStyle = 'rgba(160,210,255,.55)';
    ['1 m', '3 m', '7 m', '15 m'].forEach((s, i) => ctx.fillText(s, cx + 6, cy - (R * (i + 1)) / 4 + 15));
    // camera sectors
    const cols = ['#22d3ee', '#a78bfa', '#f472b6', '#34d399'];
    [45, 135, 225, 315].forEach((h, i) => {
      const a = ((h - 90) * Math.PI) / 180;
      ctx.fillStyle = cols[i] + '12';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a - Math.PI / 3, a + Math.PI / 3); ctx.closePath(); ctx.fill();
    });
    // sweep
    const sa = (t * 1.6) % (Math.PI * 2);
    const gr = ctx.createConicGradient ? ctx.createConicGradient(sa - 0.6, cx, cy) : null;
    if (gr) {
      gr.addColorStop(0, 'rgba(34,211,238,0)'); gr.addColorStop(0.09, 'rgba(34,211,238,.22)'); gr.addColorStop(0.1, 'rgba(34,211,238,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    }
    // user
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx, cy - 14); ctx.lineTo(cx + 10, cy + 10); ctx.lineTo(cx, cy + 4); ctx.lineTo(cx - 10, cy + 10); ctx.closePath(); ctx.fill();
    const toXY = (dist, ang) => {
      const r = (Math.log(1 + dist) / Math.log(16)) * R;
      const a = ((ang - 90) * Math.PI) / 180;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    };
    // goal
    const [gx, gy] = toXY(15, 12);
    ctx.strokeStyle = '#34d399'; ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy - 16); ctx.quadraticCurveTo(cx - 30, cy - R * 0.5, gx, gy); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#34d399'; ctx.font = F(700, 14); ctx.fillText('GOAL', gx + 8, gy + 4);

    OBJ.forEach((o, i) => {
      const [x, y] = toXY(o.dist, o.ang);
      if (mode === 'traj' && o.vel > 0) {
        // history trail (coming from further away along its motion direction)
        const dirAng = o.threat ? o.ang + 8 : o.ang;
        const sign = o.mot === 'walking away' ? -1 : 1;
        ctx.strokeStyle = o.col + '88'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = 0; k <= 6; k++) { const [hx, hy] = toXY(o.dist + sign * k * 0.45, dirAng + k * (o.threat ? 2 : 0)); k ? ctx.lineTo(hx, hy) : ctx.moveTo(hx, hy); }
        ctx.stroke();
        // prediction
        ctx.setLineDash([7, 6]); ctx.strokeStyle = o.col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, y);
        const pts = [];
        for (let k = 1; k <= 3; k++) {
          const d = Math.max(0.15, o.dist - sign * o.vel * k * 0.42);
          const a = o.threat ? o.ang - k * 14 : o.ang;
          const p = toXY(d, a); pts.push(p); ctx.lineTo(p[0], p[1]);
        }
        ctx.stroke(); ctx.setLineDash([]);
        pts.forEach((p, k) => {
          ctx.strokeStyle = o.col + 'aa'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(p[0], p[1], 8 + k * 7, 6 + k * 5, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = o.col; ctx.font = MONO(500, 12); ctx.fillText(`+${k + 1}s`, p[0] + 10 + k * 6, p[1] - 6);
        });
      }
      const pulse = o.threat ? 1 + Math.sin(t * 8) * 0.25 : 1;
      ctx.fillStyle = o.col; ctx.beginPath(); ctx.arc(x, y, 8 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = o.col + '55'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(x, y, 14 * pulse, 0, Math.PI * 2); ctx.stroke();
      if (i < 4) {
        ctx.fillStyle = '#e6f2ff'; ctx.font = F(600, 14);
        ctx.fillText(`${o.cls} ${o.dist}m`, x + 14, y + 5);
      }
    });
    if (mode === 'traj') {
      // collision zone
      ctx.strokeStyle = 'rgba(255,77,109,.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.2, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  _typed(ctx, lines, x, y, lh, elapsed, cps = 42, font = MONO(500, 18)) {
    ctx.font = font;
    let budget = elapsed * cps;
    for (let i = 0; i < lines.length; i++) {
      const [txt, col] = lines[i];
      if (budget <= 0) break;
      const shown = txt.slice(0, Math.floor(budget));
      budget -= txt.length + 8;
      ctx.fillStyle = col || '#cfe7ff';
      ctx.fillText(shown, x, y + i * lh);
      if (budget < 0 && Math.floor(elapsed * 2) % 2 === 0) {
        const w = ctx.measureText(shown).width;
        ctx.fillRect(x + w + 3, y + i * lh - 16, 10, 20);
      }
    }
  }

  draw(time) {
    const ctx = this.ctx;
    const t = time;
    const realElapsed = (performance.now() - this.t0) / 1000;
    // Combine real clock with scroll fraction so content animates dynamically even if user scrubs back and forth
    const el = Math.max(realElapsed, this.frac * 3.5);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    rr(ctx, 0, 0, W, H, 78); ctx.clip();
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#070b14'); bg.addColorStop(1, '#03050a');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // status bar + island
    ctx.fillStyle = '#e8f1ff'; ctx.font = F(600, 26); ctx.fillText('9:41', 64, 62);
    ctx.fillStyle = '#000'; rr(ctx, 258, 22, 204, 56, 28); ctx.fill();
    ctx.fillStyle = '#e8f1ff';
    for (let i = 0; i < 4; i++) ctx.fillRect(560 + i * 9, 58 - i * 6, 6, 8 + i * 6);
    rr(ctx, 606, 40, 50, 24, 7); ctx.strokeStyle = '#e8f1ff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillRect(610, 44, 34, 16);

    // app header
    ctx.fillStyle = '#22d3ee'; ctx.beginPath(); ctx.arc(46, 128, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8f1ff'; ctx.font = F(700, 24, 'Space Grotesk'); ctx.fillText('AgenticVision', 66, 137);
    ctx.fillStyle = 'rgba(52,211,153,.14)'; rr(ctx, 488, 108, 208, 40, 20); ctx.fill();
    ctx.fillStyle = Math.floor(t * 2) % 2 ? '#34d399' : '#1f8f68'; ctx.beginPath(); ctx.arc(510, 128, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a7f3d0'; ctx.font = MONO(600, 16); ctx.fillText(`LIVE ${(29 + Math.sin(t) * 0.8).toFixed(1)} fps`, 524, 134);
    const st = Math.max(0, this.stage);
    ctx.fillStyle = '#7f93b0'; ctx.font = MONO(600, 15); ctx.fillText(`STEP ${st + 1}/7`, 30, 190);
    ctx.fillStyle = '#e8f1ff'; ctx.font = F(700, 19); ctx.fillText(STAGES[st][0], 128, 190);
    ctx.font = MONO(500, 14); const chip = STAGES[st][1]; const cw = ctx.measureText(chip).width + 20;
    ctx.fillStyle = 'rgba(34,211,238,.12)'; rr(ctx, W - 24 - cw, 170, cw, 28, 8); ctx.fill();
    ctx.fillStyle = '#67e8f9'; ctx.fillText(chip, W - 14 - cw, 189);

    if (this.ready) {
      try { this['_s' + st](ctx, t, el); } catch (e) { /* keep rendering */ }
    }

    // stage progress dots
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i < st ? '#34d399' : i === st ? '#22d3ee' : 'rgba(255,255,255,.15)';
      rr(ctx, 30 + i * 96, 1420, 84, 6, 3); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,.55)'; rr(ctx, W / 2 - 90, 1450, 180, 8, 4); ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- stage 0: input
  _s0(ctx, t, el) {
    const cams = [['FL', 315, '#34d399', 0.0, false], ['FR', 45, '#22d3ee', 0.32, false], ['RL', 225, '#f472b6', 0.0, true], ['RR', 135, '#a78bfa', 0.32, true]];
    const gw = FEED.w / 2 - 4, gh = FEED.h / 2 - 4;
    cams.forEach(([n, h, c, sx, flip], i) => {
      const x = FEED.x + (i % 2) * (gw + 8), y = FEED.y + Math.floor(i / 2) * (gh + 8);
      ctx.save(); rr(ctx, x, y, gw, gh, 18); ctx.clip();
      const a = ease(el * 1.5 - i * 0.18);
      ctx.globalAlpha = a;
      if (flip) { ctx.translate(x + gw, y); ctx.scale(-1, 1); ctx.drawImage(this.img, (sx + 0.2) * IMG_W, 0.25 * IMG_H, 0.68 * IMG_W, 0.68 * IMG_H, 0, 0, gw, gh); ctx.setTransform(1, 0, 0, 1, 0, 0); }
      else ctx.drawImage(this.img, sx * IMG_W, 0.1 * IMG_H, 0.68 * IMG_W, 0.68 * IMG_H, x, y, gw, gh);
      if (flip) { ctx.fillStyle = 'rgba(40,20,80,.25)'; ctx.fillRect(x, y, gw, gh); }
      // scanline
      ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(x, y + ((t * 120 + i * 40) % gh), gw, 3);
      ctx.restore();
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(3,6,12,.7)'; rr(ctx, x + 10, y + 10, 128, 30, 8); ctx.fill();
      ctx.fillStyle = Math.floor(t * 2 + i) % 2 ? '#ff4d6d' : '#7a1d2e'; ctx.beginPath(); ctx.arc(x + 24, y + 25, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c; ctx.font = MONO(600, 15); ctx.fillText(`CAM ${n} ${h}°`, x + 36, y + 31);
      ctx.strokeStyle = c; ctx.lineWidth = 2; rr(ctx, x + 1, y + 1, gw - 2, gh - 2, 18); ctx.stroke();
      ctx.restore();
    });
    // sensor rows
    let y = 760;
    const row = (title, sub, col, drawViz) => {
      ctx.fillStyle = 'rgba(255,255,255,.035)'; rr(ctx, 24, y, 672, 148, 22); ctx.fill();
      ctx.fillStyle = col; ctx.font = F(700, 20); ctx.fillText(title, 46, y + 40);
      ctx.fillStyle = '#8fa3c0'; ctx.font = MONO(500, 15); ctx.fillText(sub, 46, y + 68);
      drawViz(46, y + 84, 628, 50);
      y += 164;
    };
    row('Video × 4', '1536×864 · 30 fps · frame-synced', '#22d3ee', (x, yy, w, h) => {
      for (let i = 0; i < 40; i++) {
        const v = 0.35 + 0.65 * Math.abs(Math.sin(i * 0.7 + t * 3));
        ctx.fillStyle = `rgba(34,211,238,${0.25 + v * 0.6})`; ctx.fillRect(x + i * 15.7, yy + h - v * h, 10, v * h);
      }
    });
    row('ToF × 4', 'VL53L5CX · 8×8 zones · metric range', '#fb7185', (x, yy, w, h) => {
      for (let k = 0; k < 4; k++) for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {
        const v = 0.5 + 0.5 * Math.sin(c * 0.9 + r * 1.3 + t * 2 + k);
        const [R, G, Bc] = inferno(v);
        ctx.fillStyle = `rgb(${R},${G},${Bc})`; ctx.fillRect(x + k * 160 + c * 18, yy + r * 12.5, 16, 11);
      }
    });
    row('IMU', '6-axis · 200 Hz · heading + gait', '#a78bfa', (x, yy, w, h) => {
      ['#a78bfa', '#f472b6', '#67e8f9'].forEach((c, k) => {
        ctx.strokeStyle = c; ctx.lineWidth = 2.5; ctx.beginPath();
        for (let i = 0; i <= 120; i++) { const px = x + (i / 120) * w; const py = yy + h / 2 + Math.sin(i * 0.18 + t * (3 + k) + k * 2) * (h / 2 - 4) * (0.4 + k * 0.25); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.stroke();
      });
    });
    ctx.fillStyle = '#8fa3c0'; ctx.font = MONO(500, 15); ctx.fillText(`link ▲ ${(38 + Math.sin(t * 2) * 3).toFixed(1)} Mb/s  ·  latency 12 ms`, 46, y + 18);
  }

  // ---------------------------------------------------------------- stage 1: detection
  _s1(ctx, t, el) {
    this._feed(ctx);
    const sweep = clamp(el / 1.1);
    if (sweep < 1) {
      ctx.fillStyle = 'rgba(34,211,238,.25)'; ctx.fillRect(FEED.x, this.fy(sweep) - 3, FEED.w, 6);
    }
    OBJ.forEach((o, i) => {
      const a = ease((el - 0.35 - i * 0.18) * 3);
      if (a > 0) this._box(ctx, o, t, `${o.cls} ${o.conf.toFixed(2)}`, null, a);
    });
    let y = 770;
    ctx.fillStyle = '#e8f1ff'; ctx.font = F(700, 22); ctx.fillText('Detections', 30, y);
    ctx.fillStyle = '#8fa3c0'; ctx.font = MONO(500, 15); ctx.fillText('NMS-free · 640 px · FP16', 470, y);
    y += 26;
    OBJ.forEach((o, i) => {
      const a = ease((el - 0.35 - i * 0.18) * 3);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(255,255,255,.035)'; rr(ctx, 24, y, 672, 72, 16); ctx.fill();
      ctx.fillStyle = o.col; rr(ctx, 40, y + 22, 28, 28, 7); ctx.fill();
      ctx.fillStyle = '#e8f1ff'; ctx.font = F(600, 20); ctx.fillText(o.cls, 86, y + 44);
      ctx.fillStyle = 'rgba(255,255,255,.08)'; rr(ctx, 330, y + 30, 260, 12, 6); ctx.fill();
      ctx.fillStyle = o.col; rr(ctx, 330, y + 30, 260 * o.conf * a, 12, 6); ctx.fill();
      ctx.fillStyle = '#cfe7ff'; ctx.font = MONO(600, 17); ctx.fillText(o.conf.toFixed(2), 610, y + 44);
      y += 82;
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#67e8f9'; ctx.font = MONO(600, 17); ctx.fillText(`6 objects · ${(9.4 + Math.sin(t * 3) * 0.6).toFixed(1)} ms / frame`, 30, y + 26);
  }

  // ---------------------------------------------------------------- stage 2: depth
  _s2(ctx, t, el) {
    this._feed(ctx);
    const wipe = ease(el / 1.3);
    ctx.save();
    rr(ctx, FEED.x, FEED.y, FEED.w * wipe, FEED.h, 26); ctx.clip();
    ctx.filter = 'blur(5px)';
    ctx.globalAlpha = 0.92;
    ctx.drawImage(this.depth, FEED.x - 8, FEED.y - 8, FEED.w + 16, FEED.h + 16);
    ctx.filter = 'none'; ctx.globalAlpha = 0.18;
    ctx.drawImage(this.img, FEED.x, FEED.y, FEED.w, FEED.h);
    ctx.restore();
    if (wipe < 1) { ctx.fillStyle = '#fff'; ctx.fillRect(FEED.x + FEED.w * wipe - 2, FEED.y, 4, FEED.h); }
    // ToF 8x8 grid
    const gx = FEED.x + FEED.w * 0.3, gy = FEED.y + FEED.h * 0.42, gs = FEED.w * 0.4 / 8;
    ctx.globalAlpha = ease(el - 1.0);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const v = 0.5 + 0.5 * Math.sin(c * 0.6 + r * 0.8 + t * 3);
      ctx.strokeStyle = `rgba(255,255,255,${0.15 + v * 0.25})`; ctx.lineWidth = 1;
      ctx.strokeRect(gx + c * gs, gy + r * gs * 0.62, gs, gs * 0.62);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(gx + c * gs + gs / 2, gy + r * gs * 0.62 + gs * 0.31, 2 + v * 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    OBJ.slice(0, 4).forEach((o, i) => {
      const a = ease((el - 1.2 - i * 0.15) * 3);
      if (a <= 0) return;
      const [x0, y0, x1] = o.box;
      const cx = this.fx((x0 + x1) / 2), cy = this.fy(y0) - 6;
      ctx.globalAlpha = a;
      ctx.font = F(800, 26); const s = `${o.dist} m`; const w = ctx.measureText(s).width + 20;
      ctx.fillStyle = 'rgba(3,6,12,.82)'; rr(ctx, cx - w / 2, cy - 34, w, 36, 10); ctx.fill();
      ctx.fillStyle = o.threat ? '#ff8fa3' : '#fff'; ctx.fillText(s, cx - w / 2 + 10, cy - 7);
      ctx.globalAlpha = 1;
    });
    // lower: fit chart
    let y = 760;
    ctx.fillStyle = 'rgba(255,255,255,.035)'; rr(ctx, 24, y, 672, 400, 22); ctx.fill();
    ctx.fillStyle = '#e8f1ff'; ctx.font = F(700, 21); ctx.fillText('Metric scale recovery', 46, y + 42);
    ctx.fillStyle = '#8fa3c0'; ctx.font = MONO(500, 15); ctx.fillText('MiDaS relative depth  ×  ToF ground truth', 46, y + 70);
    const ox = 90, oy = y + 360, cw = 560, ch = 250;
    ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ox, oy - ch); ctx.lineTo(ox, oy); ctx.lineTo(ox + cw, oy); ctx.stroke();
    ctx.fillStyle = '#8fa3c0'; ctx.font = MONO(500, 13); ctx.fillText('MiDaS (rel.)', ox + cw - 100, oy + 22); ctx.fillText('ToF (m)', ox - 60, oy - ch - 8);
    const k = ease((el - 0.5) / 1.5);
    for (let i = 0; i < 40; i++) {
      const u = ((i * 37) % 40) / 40;
      if (i / 40 > k) continue;
      const v = u + Math.sin(i * 12.9) * 0.05;
      ctx.fillStyle = '#fb7185'; ctx.beginPath(); ctx.arc(ox + u * cw, oy - v * ch * 0.9, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ox, oy - 4); ctx.lineTo(ox + cw * k, oy - ch * 0.9 * k - 4); ctx.stroke();
    y += 420;
    ctx.fillStyle = '#e8f1ff'; ctx.font = MONO(600, 20); ctx.fillText('Z = s · d + t', 46, y + 30);
    ctx.fillStyle = '#8fa3c0'; ctx.font = MONO(500, 15); ctx.fillText('fit per frame on 64 ToF zones → metres', 46, y + 60);
    ctx.fillStyle = '#67e8f9'; ctx.fillText(`${(13.8 + Math.sin(t * 2.4) * 0.7).toFixed(1)} ms`, 590, y + 30);
  }

  // ---------------------------------------------------------------- stage 3: fusion
  _s3(ctx, t, el) {
    this._feed(ctx, 1, 0.25);
    OBJ.slice(0, 4).forEach((o, i) => {
      const a = ease((el - i * 0.15) * 3);
      const side = o.ang >= 0 ? 'R' : 'L';
      this._box(ctx, o, t, `${o.cls} · ${o.dist} m`, `${Math.abs(o.ang)}° ${side} · ${o.mot}`, a);
    });
    this._radar(ctx, 360, 1000, 220, t, 'fusion');
    // JSON card
    const y = 1240;
    ctx.fillStyle = 'rgba(255,77,109,.08)'; rr(ctx, 24, y, 672, 160, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(255,77,109,.35)'; ctx.lineWidth = 1.5; rr(ctx, 24, y, 672, 160, 18); ctx.stroke();
    this._typed(ctx, [
      ['{ obj: "motorbike",  dist: 1.2 m,', '#ffd1da'],
      ['  dir: 30° right,    vel: 2.4 m/s,', '#ffd1da'],
      ['  motion: "towards_user",  cam: FR }', '#ffd1da'],
    ], 46, y + 46, 40, el, 60, MONO(600, 19));
  }

  // ---------------------------------------------------------------- stage 4: trajectory
  _s4(ctx, t, el) {
    this._feed(ctx, 1, 0.3);
    const o = OBJ[0];
    this._box(ctx, o, t, 'motorbike · TRACK #07', 'v = 2.4 m/s → user', 1);
    // motion arrow
    const ax = this.fx(0.82), ay = this.fy(0.72);
    ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 6; ctx.setLineDash([12, 8]); ctx.lineDashOffset = -t * 40;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(this.fx(0.7), this.fy(0.95), this.fx(0.52), this.fy(0.98)); ctx.stroke();
    ctx.setLineDash([]);
    [OBJ[2], OBJ[5]].forEach((p) => this._box(ctx, p, t, `${p.cls}`, `${p.mot}`, 0.85));
    this._radar(ctx, 360, 1000, 220, t, 'traj');
    const y = 1250;
    const flash = 0.6 + 0.4 * Math.sin(t * 9);
    ctx.fillStyle = `rgba(255,77,109,${0.14 + flash * 0.12})`; rr(ctx, 24, y, 672, 140, 18); ctx.fill();
    ctx.fillStyle = '#ff8fa3'; ctx.font = F(800, 30); ctx.fillText('COLLISION RISK · HIGH', 46, y + 50);
    ctx.fillStyle = '#ffd1da'; ctx.font = MONO(600, 19);
    ctx.fillText(`time-to-collision  ${(1.6 + Math.sin(t) * 0.05).toFixed(1)} s`, 46, y + 90);
    ctx.fillStyle = '#8fa3c0'; ctx.font = MONO(500, 15); ctx.fillText('state [x, y, vx, vy] · constant-velocity Kalman', 46, y + 122);
  }

  // ---------------------------------------------------------------- stage 5: reasoning
  _s5(ctx, t, el) {
    this._feed(ctx, 1, 0.45);
    this._box(ctx, OBJ[0], t, 'motorbike 1.2 m · TTC 1.6 s', null, 1);
    this._box(ctx, { ...OBJ[3], box: GOAL.box, col: '#34d399' }, t, 'GOAL · bus stop · 38 m', null, 1);
    let y = 750;
    // user goal bubble
    ctx.fillStyle = 'rgba(34,211,238,.16)'; rr(ctx, 230, y, 466, 64, 22); ctx.fill();
    ctx.fillStyle = '#cff8ff'; ctx.font = F(600, 21); ctx.fillText('“Take me to the bus stop.”', 254, y + 40);
    ctx.fillStyle = '#7f93b0'; ctx.font = MONO(500, 13); ctx.fillText('USER GOAL · via inline mic', 230, y + 86);
    y += 112;
    ctx.fillStyle = 'rgba(167,139,250,.08)'; rr(ctx, 24, y, 672, 330, 20); ctx.fill();
    ctx.strokeStyle = 'rgba(167,139,250,.3)'; ctx.lineWidth = 1.5; rr(ctx, 24, y, 672, 330, 20); ctx.stroke();
    ctx.fillStyle = '#c4b5fd'; ctx.font = MONO(600, 14); ctx.fillText('PHI-3 MINI · REASONING', 46, y + 34);
    this._typed(ctx, [
      ['> motorbike 1.2m @30°R, closing 2.4 m/s', '#e9e3ff'],
      ['> TTC 1.6 s on current heading -> HIGH', '#ffb3c1'],
      ['> footpath left: clear for 3 m', '#e9e3ff'],
      ['> auto-rickshaw 3.1 m left edge: avoid', '#e9e3ff'],
      ['> goal: bus stop 38 m ahead', '#e9e3ff'],
      ['> plan: STOP -> slight LEFT -> straight', '#a7f3d0'],
    ], 46, y + 76, 44, el, 48, MONO(500, 18));
    y += 352;
    const show = ease((el - 4.4) * 2);
    ctx.globalAlpha = show;
    ctx.fillStyle = 'rgba(52,211,153,.12)'; rr(ctx, 24, y, 672, 150, 20); ctx.fill();
    ctx.strokeStyle = 'rgba(52,211,153,.45)'; rr(ctx, 24, y, 672, 150, 20); ctx.stroke();
    ctx.fillStyle = '#6ee7b7'; ctx.font = MONO(600, 14); ctx.fillText('DECISION', 46, y + 34);
    ctx.fillStyle = '#ecfdf5'; ctx.font = F(800, 30); ctx.fillText('STOP  →  SLIGHT LEFT', 46, y + 80);
    ctx.fillStyle = '#a7f3d0'; ctx.font = MONO(500, 16); ctx.fillText('urgency: high · then continue to goal', 46, y + 118);
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- stage 6: speech
  _s6(ctx, t, el) {
    this._feed(ctx, 1, 0.35);
    // guidance arrow
    ctx.save();
    ctx.strokeStyle = '#34d399'; ctx.lineWidth = 16; ctx.lineCap = 'round';
    ctx.shadowColor = '#34d399'; ctx.shadowBlur = 20;
    const k = ease(el / 1.2);
    ctx.beginPath(); ctx.moveTo(this.fx(0.5), this.fy(0.98));
    ctx.quadraticCurveTo(this.fx(0.47 - 0.05 * k), this.fy(0.98 - 0.3 * k), this.fx(0.44 - 0.02 * k), this.fy(0.98 - 0.45 * k));
    ctx.stroke();
    ctx.restore();
    this._box(ctx, OBJ[0], t, 'STOP', null, 0.9);
    let y = 760;
    ctx.fillStyle = 'rgba(251,191,36,.07)'; rr(ctx, 24, y, 672, 300, 22); ctx.fill();
    // waveform
    const n = 56;
    for (let i = 0; i < n; i++) {
      const env = Math.sin((i / n) * Math.PI);
      const v = env * (0.25 + 0.75 * Math.abs(Math.sin(i * 0.9 + t * 9) * Math.sin(i * 0.33 - t * 5)));
      const h = 12 + v * 200;
      const g = ctx.createLinearGradient(0, y + 150 - h / 2, 0, y + 150 + h / 2);
      g.addColorStop(0, '#fde68a'); g.addColorStop(1, '#fb7185');
      ctx.fillStyle = g; rr(ctx, 48 + i * 11.2, y + 150 - h / 2, 6, h, 3); ctx.fill();
    }
    y += 330;
    const words = 'Stop. Motorbike approaching from your right. Now step slightly left and continue straight.'.split(' ');
    const shown = Math.floor(el * 3.2);
    ctx.font = F(600, 27);
    let x = 34, line = 0;
    words.forEach((w, i) => {
      const ww = ctx.measureText(w + ' ').width;
      if (x + ww > 690) { x = 34; line++; }
      ctx.fillStyle = i < shown ? '#fff3d6' : 'rgba(255,255,255,.22)';
      ctx.fillText(w, x, y + line * 40);
      x += ww;
    });
    y += 160;
    ctx.fillStyle = 'rgba(255,255,255,.04)'; rr(ctx, 24, y, 672, 64, 16); ctx.fill();
    ctx.fillStyle = '#fcd38a'; ctx.font = MONO(600, 16); ctx.fillText('TTS on-device  ·  ▶ sending to neckband', 46, y + 40);
  }
}
