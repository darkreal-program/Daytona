document.documentElement.classList.add('js');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Top bar: solid background once the hero is scrolled past ---------- */

const topbar = document.querySelector('.topbar');
const hero = document.querySelector('.hero');

const onScroll = () => {
  topbar.classList.toggle('is-scrolled', window.scrollY > hero.offsetHeight * 0.6);
};
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

/* ---------- Prices light up as they enter the viewport ---------- */

const items = document.querySelectorAll('.item');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-lit');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -12% 0px' });
  items.forEach((item) => io.observe(item));
} else {
  items.forEach((item) => item.classList.add('is-lit'));
}

/* ---------- Descriptions: first sentence visible, the rest on hover ---------- */

const texts = document.querySelectorAll('.item__text');

function measureTexts() {
  texts.forEach((p) => {
    const node = p.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) return;

    const style = getComputedStyle(p);
    const lh = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.65;
    const text = node.textContent;
    const match = text.match(/[.!?…](?=\s|$)/);
    const end = match ? match.index + 1 : text.length;

    const box = p.getBoundingClientRect();
    const lineOf = (r) => Math.floor((r.top + r.height / 2 - box.top) / lh);
    const range = document.createRange();

    range.setStart(node, 0);
    range.setEnd(node, text.length);
    const all = [...range.getClientRects()].filter((r) => r.width > 0);
    const lines = all.length ? Math.max(...all.map(lineOf)) + 1 : 1;

    // which line the first sentence ends on
    range.setEnd(node, end);
    const sentence = [...range.getClientRects()].filter((r) => r.width > 0);
    let visible = sentence.length ? lineOf(sentence[sentence.length - 1]) + 1 : 1;
    // a one-sentence description shows just its first line, so hover always reveals something
    if (visible >= lines) visible = 1;

    // fog spans the text on the last visible line, not the whole column
    const tail = Math.max(0, ...all.filter((r) => lineOf(r) === visible - 1).map((r) => r.right - box.left));

    p.style.setProperty('--lh', `${lh}px`);
    p.style.setProperty('--collapsed', `${visible * lh}px`);
    p.style.setProperty('--tail', `${Math.ceil(tail) + 2}px`);
    p.style.setProperty('--full', `${p.scrollHeight}px`);
  });
}

items.forEach((item) => {
  item.tabIndex = 0;
  // touch screens have no hover, so a tap opens and closes the description
  item.addEventListener('click', () => {
    if (window.matchMedia('(hover: none)').matches) item.classList.toggle('is-open');
  });
});

measureTexts();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureTexts);
let measureTimer;
window.addEventListener('resize', () => {
  clearTimeout(measureTimer);
  measureTimer = setTimeout(measureTexts, 120);
});

/* ---------- Hero: hexagonal LED ceiling seen in perspective ----------
   World space: camera at origin looking along +z, ceiling plane at y = 1.
   The floor canvas draws the same lights mirrored below the horizon. */

const ceiling = document.getElementById('ceiling');
const floor = document.getElementById('floor');
const HORIZON = 0.54;            // keep in sync with --horizon in styles.css
const R = 0.3;                   // hexagon circumradius
const GAP = 0.045;               // gap between tubes at each joint
const TUBE = 0.024;              // tube thickness
const Z_NEAR = 1.55;
const Z_FAR = 6.4;

let segments = [];
let size = { w: 0, h: 0, dpr: 1 };
let start = 0;
let done = reduceMotion;

function shorten(a, b, g) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  return [{ x: a.x + ux * g, z: a.z + uz * g }, { x: b.x - ux * g, z: b.z - uz * g }];
}

// Liang–Barsky clip of segment a→b to the panel rectangle
function clip(a, b, x0, x1, z0, z1) {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dz = b.z - a.z;
  const checks = [[-dx, a.x - x0], [dx, x1 - a.x], [-dz, a.z - z0], [dz, z1 - a.z]];
  for (const [p, q] of checks) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
    else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  if (t1 - t0 < 0.08) return null;
  return [{ x: a.x + dx * t0, z: a.z + dz * t0 }, { x: a.x + dx * t1, z: a.z + dz * t1 }];
}

function buildScene(halfWidth) {
  const seen = new Map();
  const x0 = -halfWidth, x1 = halfWidth, z0 = Z_NEAR, z1 = Z_FAR;
  const colStep = Math.sqrt(3) * R;
  const rowStep = 1.5 * R;
  const span = z1 - z0;

  // pointy-top hexagons laid out along the depth axis
  for (let row = -1; row * rowStep + z0 < z1 + R; row++) {
    const cz = z0 + row * rowStep;
    const offset = (row & 1) ? colStep / 2 : 0;
    for (let cx = -Math.ceil(halfWidth / colStep + 1) * colStep + offset; cx < x1 + colStep; cx += colStep) {
      const corners = [];
      for (let k = 0; k < 6; k++) {
        const ang = Math.PI / 180 * (60 * k + 30);
        corners.push({ x: cx + R * Math.cos(ang), z: cz + R * Math.sin(ang) });
      }
      for (let k = 0; k < 6; k++) {
        const a = corners[k], b = corners[(k + 1) % 6];
        const key = `${((a.x + b.x) / 2).toFixed(3)}:${((a.z + b.z) / 2).toFixed(3)}`;
        if (seen.has(key)) continue;
        const [sa, sb] = shorten(a, b, GAP);
        const c = clip(sa, sb, x0, x1, z0, z1);
        if (!c) { seen.set(key, null); continue; }
        seen.set(key, makeSegment(c[0], c[1], span));
      }
    }
  }

  const list = [...seen.values()].filter(Boolean);

  // rectangular frame around the honeycomb, split into tube lengths
  const rails = [
    [{ x: x0, z: z0 }, { x: x1, z: z0 }],
    [{ x: x0, z: z1 }, { x: x1, z: z1 }],
    [{ x: x0, z: z0 }, { x: x0, z: z1 }],
    [{ x: x1, z: z0 }, { x: x1, z: z1 }],
  ];
  for (const [a, b] of rails) {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.round(len / (R * 1.6)));
    for (let i = 0; i < n; i++) {
      const p = { x: a.x + (b.x - a.x) * i / n, z: a.z + (b.z - a.z) * i / n };
      const q = { x: a.x + (b.x - a.x) * (i + 1) / n, z: a.z + (b.z - a.z) * (i + 1) / n };
      const [sp, sq] = shorten(p, q, GAP);
      list.push(makeSegment(sp, sq, span));
    }
  }
  return list;
}

function makeSegment(a, b, span) {
  const depth = ((a.z + b.z) / 2 - Z_NEAR) / span;
  // rows switch on from the viewer toward the far wall, each tube with a little jitter
  return { a, b, on: 140 + depth * 1050 + Math.random() * 220 };
}

function level(dt) {
  if (dt < 0) return 0;
  if (dt < 45) return 0.85;
  if (dt < 110) return 0.18;
  if (dt < 150) return 0.7;
  return 1;
}

function resize() {
  const rect = hero.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  size = { w: rect.width, h: rect.height, dpr };
  for (const c of [ceiling, floor]) {
    c.width = Math.round(rect.width * dpr);
    c.height = Math.round(rect.height * dpr);
  }
  // panel narrows to roughly the width of the name at the far wall
  const focal = rect.height * 0.95;
  const farHalf = Math.min(rect.width * 0.36, 620);
  const halfWidth = Math.max(1.05, Math.min(2.6, farHalf * Z_FAR / focal));
  segments = buildScene(halfWidth);
  draw(done ? Infinity : performance.now() - start);
}

function drawTo(ctx, elapsed, mirror) {
  const { w, h, dpr } = size;
  const focal = h * 0.95;
  const cx = w / 2;
  const hy = h * HORIZON;
  const dir = mirror ? 1 : -1;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const project = (p) => ({ x: cx + p.x * focal / p.z, y: hy + dir * focal / p.z, s: focal / p.z });

  for (const seg of segments) {
    const lit = level(elapsed - seg.on);
    const A = project(seg.a), B = project(seg.b);
    const wa = TUBE * A.s / 2, wb = TUBE * B.s / 2;
    let nx = -(B.y - A.y), ny = B.x - A.x;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;

    // fade with distance so the far wall falls into the dark
    const zMid = (seg.a.z + seg.b.z) / 2;
    const fade = 0.45 + 0.55 * Math.pow(Z_NEAR / zMid, 0.6);
    const alpha = lit > 0 ? lit * fade : 0.06;

    ctx.fillStyle = lit > 0 ? `rgba(242, 247, 255, ${alpha})` : `rgba(160, 180, 200, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(A.x + nx * wa, A.y + ny * wa);
    ctx.lineTo(B.x + nx * wb, B.y + ny * wb);
    ctx.lineTo(B.x - nx * wb, B.y - ny * wb);
    ctx.lineTo(A.x - nx * wa, A.y - ny * wa);
    ctx.closePath();
    ctx.fill();
  }
}

function draw(elapsed) {
  drawTo(ceiling.getContext('2d'), elapsed, false);
  drawTo(floor.getContext('2d'), elapsed, true);
}

function frame(now) {
  const elapsed = now - start;
  draw(elapsed);
  if (elapsed < 1700) requestAnimationFrame(frame);
  else done = true;
}

if (ceiling && floor && ceiling.getContext) {
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });
  start = performance.now();
  resize();
  if (!reduceMotion) requestAnimationFrame(frame);
}
