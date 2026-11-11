// habillage.js : thème, options et position des éléments des overlays (admin/habillage.html).
// Le moniteur affiche l'overlay complet en mode édition (?edit) : on y déplace et redimensionne
// chaque élément à la souris. Tout est enregistré dans data/habillage.json, lu en direct par les overlays.
'use strict';

const { $ } = SB;
let H = null, S = null;
let look = null, score = null;
let key = 'score';                                   // élément édité

const actH = fn => look.update(fn);

const ELEMENTS = [
  { key: 'score',   label: 'Scoreboard',       page: 'score',   sel: '#bug' },
  { key: 'lower',   label: 'Bandeau nom',      page: 'infos',   sel: '.lower' },
  { key: 'sub',     label: 'Remplacement',     page: 'infos',   sel: '.subst' },
  { key: 'card',    label: 'Carton central',   page: 'infos',   sel: '.card' },
  { key: 'ticker',  label: 'Bandeau défilant', page: 'infos',   sel: '.ticker', fixedX: true, noScale: true },
  { key: 'equipes', label: 'Compositions',     page: 'equipes', sel: '#board' }
];
const el = () => ELEMENTS.find(e => e.key === key);

/* ======================================================================
   Thème et options
   ====================================================================== */

for (const name of Object.keys(SB.FONTS)) $('font').append(new Option(name, name));
const setTheme = (k, v) => actH(H => { H.theme[k] = v; });
$('accent').addEventListener('input', e => setTheme('accent', e.target.value));
$('pitch').addEventListener('input', e => setTheme('pitch', e.target.value));
$('radius').addEventListener('input', e => setTheme('radius', +e.target.value));
$('font').addEventListener('change', e => setTheme('font', e.target.value));
for (const inp of document.querySelectorAll('[data-opt]')) {
  inp.addEventListener(inp.type === 'checkbox' ? 'change' : 'input', () => {
    const v = inp.type === 'checkbox' ? inp.checked : +inp.value;
    actH(H => { H.options[inp.dataset.opt] = v; });
  });
}
// Twitch
const setTw = (k, v) => actH(H => { H.twitch[k] = v; });
$('twChannel').addEventListener('input', e => setTw('channel', e.target.value.trim().replace(/^.*twitch\.tv\//i, '').toLowerCase()));
$('twMax').addEventListener('input', e => setTw('max', +e.target.value));
$('twFade').addEventListener('input', e => setTw('fade', +e.target.value));
$('twHideCmd').addEventListener('change', e => setTw('hideCmd', e.target.checked));
$('twBots').addEventListener('input', e => setTw('bots', e.target.value));
$('twMinBits').addEventListener('input', e => setTw('minBits', Math.max(1, +e.target.value || 1)));
for (const inp of document.querySelectorAll('[data-twalert]')) {
  inp.addEventListener('change', () => { const v = inp.checked; actH(H => { H.twitch.alerts[inp.dataset.twalert] = v; }); });
}
const twUrl = mode => new URL('../overlay/twitch.html?mode=' + mode, location.href).href;
SB.setText('twUrlChat', twUrl('tchat'));
SB.setText('twUrlAlerts', twUrl('alertes'));

$('compact').addEventListener('change', e => { const v = e.target.checked; score.update(S => { S.compact = v; }); });

// Aperçu de la police choisie
const loaded = new Set(['Archivo']);
function demoFont(name) {
  if (!loaded.has(name)) {
    loaded.add(name);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${SB.FONTS[name]}&display=swap`;
    document.head.append(link);
  }
  $('fontDemo').style.fontFamily = `'${name}', sans-serif`;
}

function setVal(id, v) {
  const e = typeof id === 'string' ? $(id) : id;
  if (document.activeElement !== e && e.value !== String(v)) e.value = v;
}

function renderLook(state) {
  H = state;
  const t = H.theme, o = H.options;
  setVal('accent', t.accent); SB.setText('accentTxt', t.accent);
  setVal('pitch', t.pitch); SB.setText('pitchTxt', t.pitch);
  setVal('radius', t.radius); SB.setText('radiusTxt', t.radius + ' px');
  setVal('font', t.font); demoFont(t.font);
  document.querySelectorAll('[data-plates]').forEach(b => b.classList.toggle('sel', b.dataset.plates === t.plates));
  document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('sel', b.dataset.speed === o.speed));
  for (const inp of document.querySelectorAll('[data-opt]')) {
    if (inp.type === 'checkbox') inp.checked = !!o[inp.dataset.opt];
    else setVal(inp, o[inp.dataset.opt]);
  }
  const tw = H.twitch;
  setVal('twChannel', tw.channel);
  setVal('twMax', tw.max); SB.setText('twMaxTxt', tw.max);
  setVal('twFade', tw.fade); SB.setText('twFadeTxt', tw.fade ? tw.fade + ' s' : 'jamais');
  $('twHideCmd').checked = tw.hideCmd;
  setVal('twBots', tw.bots);
  setVal('twMinBits', tw.minBits);
  for (const inp of document.querySelectorAll('[data-twalert]')) inp.checked = !!tw.alerts[inp.dataset.twalert];
  SB.setText('bannerSecTxt', o.bannerSec + ' s');
  SB.setText('autoHideSecTxt', o.autoHideSec + ' s');
  renderFields();
}

/* ======================================================================
   Éditeur de positions
   ====================================================================== */

$('elTabs').replaceChildren(...ELEMENTS.map(e => {
  const b = document.createElement('button');
  b.dataset.el = e.key;
  b.textContent = e.label;
  return b;
}));

const frame = $('frame');
SB.monitor(frame);
const scale = () => $('editor').clientWidth / 1920;

// Document de l'overlay qui contient l'élément (pages imbriquées dans overlay/index.html)
function docOf(page) {
  try {
    const inner = frame.contentDocument.querySelector(`iframe[data-page="${page}"]`);
    return inner && inner.contentDocument;
  } catch (e) { return null; }
}
function target() {
  const d = docOf(el().page);
  return d && d.querySelector(el().sel);
}

// Choix de l'élément édité : il s'affiche avec un contenu d'exemple dans le moniteur
function focusEl(k) {
  key = k;
  document.querySelectorAll('[data-el]').forEach(b => b.classList.toggle('sel', b.dataset.el === key));
  for (const page of ['score', 'equipes', 'infos']) {
    const d = docOf(page);
    if (d && d.defaultView.editFocus) d.defaultView.editFocus(key);
  }
  try { localStorage.setItem('habillage.el', key); } catch (e) { /* stockage indisponible */ }
  renderFields();
}
frame.addEventListener('load', () => setTimeout(() => focusEl(key), 800));

const cur = () => (H && H.layout[key]) || { dx: 0, dy: 0, s: 1 };

function renderFields() {
  if (!H) return;
  const l = cur();
  setVal('dx', l.dx);
  setVal('dy', l.dy);
  setVal('sz', Math.round(l.s * 100));
  $('dx').disabled = !!el().fixedX;
  $('sz').disabled = !!el().noScale;
  $('handle').hidden = !!el().noScale;
}

function commit(l) { const k = key; actH(H => { H.layout[k] = l; }); }
$('dx').addEventListener('change', e => commit({ ...cur(), dx: Math.round(+e.target.value || 0) }));
$('dy').addEventListener('change', e => commit({ ...cur(), dy: Math.round(+e.target.value || 0) }));
$('sz').addEventListener('change', e => commit({ ...cur(), s: Math.max(.4, Math.min(2.5, (+e.target.value || 100) / 100)) }));
$('resetEl').onclick = () => commit({ dx: 0, dy: 0, s: 1 });
$('resetAll').onclick = () => actH(H => { H.layout = SB.lookDefaults().layout; });

// Applique tout de suite un placement dans le moniteur (sans attendre le serveur)
function preview(l) {
  const d = docOf(el().page);
  if (!d) return;
  const r = d.documentElement.style;
  r.setProperty(`--${key}-dx`, l.dx + 'px');
  r.setProperty(`--${key}-dy`, l.dy + 'px');
  r.setProperty(`--${key}-s`, l.s);
}

// Cadre de l'élément au-dessus du moniteur, mis à jour en continu
let drag = null;
(function frameLoop() {
  const t = target(), box = $('box'), k = scale();
  if (t && !drag) {
    const r = t.getBoundingClientRect();
    if (r.width && r.height) {
      Object.assign(box.style, { left: r.left * k + 'px', top: r.top * k + 'px', width: r.width * k + 'px', height: r.height * k + 'px' });
      box.hidden = false;
      SB.setText('boxName', el().label);
    } else box.hidden = true;
  } else if (!t) box.hidden = true;
  requestAnimationFrame(frameLoop);
})();

// Lignes qui aimantent : centre de l'écran et cadre de sécurité (5 %)
const SNAP_X = [96, 960, 1824], SNAP_Y = [54, 540, 1026], SNAP = 12;
function snap(rect, dx, dy) {
  let gx = null, gy = null;
  const xs = [rect.left + dx, rect.left + rect.width / 2 + dx, rect.right + dx];
  const ys = [rect.top + dy, rect.top + rect.height / 2 + dy, rect.bottom + dy];
  for (const line of SNAP_X) for (const x of xs) if (gx === null && Math.abs(x - line) < SNAP) { dx += line - x; gx = line; }
  for (const line of SNAP_Y) for (const y of ys) if (gy === null && Math.abs(y - line) < SNAP) { dy += line - y; gy = line; }
  return { dx, dy, gx, gy };
}
function guides(gx, gy) {
  const k = scale();
  $('gx').hidden = gx === null; if (gx !== null) $('gx').style.left = gx * k + 'px';
  $('gy').hidden = gy === null; if (gy !== null) $('gy').style.top = gy * k + 'px';
}
guides(null, null);

$('box').addEventListener('pointerdown', e => {
  const t = target();
  if (!t) return;
  e.preventDefault();
  $('box').setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, start: { ...cur() }, rect: t.getBoundingClientRect(), resize: e.target === $('handle'), l: { ...cur() } };
});
$('box').addEventListener('pointermove', e => {
  if (!drag) return;
  const k = scale(), mx = (e.clientX - drag.x) / k, my = (e.clientY - drag.y) / k;
  const st = drag.start;
  if (drag.resize) {
    const s = Math.max(.4, Math.min(2.5, st.s * (drag.rect.width + mx) / drag.rect.width));
    drag.l = { ...st, s: Math.round(s * 100) / 100 };
  } else {
    const sn = snap(drag.rect, el().fixedX ? 0 : mx, my);
    drag.l = { ...st, dx: Math.round(st.dx + sn.dx), dy: Math.round(st.dy + sn.dy) };
    guides(el().fixedX ? null : sn.gx, sn.gy);
  }
  preview(drag.l);
  const box = $('box'), r = drag.rect;
  const kk = drag.resize ? drag.l.s / st.s : 1;
  Object.assign(box.style, drag.resize
    ? { width: r.width * kk * k + 'px', height: r.height * kk * k + 'px' }
    : { left: (r.left + drag.l.dx - st.dx) * k + 'px', top: (r.top + drag.l.dy - st.dy) * k + 'px' });
});
function endDrag() {
  if (!drag) return;
  const l = drag.l;
  drag = null;
  guides(null, null);
  commit(l);
}
$('box').addEventListener('pointerup', endDrag);
$('box').addEventListener('pointercancel', endDrag);

document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.el) focusEl(b.dataset.el);
  if (b.dataset.plates) setTheme('plates', b.dataset.plates);
  if (b.dataset.speed) actH(H => { H.options.speed = b.dataset.speed; });
  if (b.dataset.twtest) actH(H => { H.twitch.test = { id: H.twitch.test.id + 1, type: b.dataset.twtest }; });
  if (b.dataset.twcopy) navigator.clipboard.writeText(twUrl(b.dataset.twcopy)).then(() => { b.textContent = 'Copié'; setTimeout(() => { b.textContent = 'Copier'; }, 1200); }).catch(() => {});
});

// Flèches du clavier : déplacement fin de l'élément (Maj : 10 px)
document.addEventListener('keydown', e => {
  if (SB.typing(e) || !H) return;
  const step = e.shiftKey ? 10 : 1;
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  const m = moves[e.key];
  if (!m) return;
  e.preventDefault();
  const l = cur();
  commit({ ...l, dx: el().fixedX ? l.dx : l.dx + m[0], dy: l.dy + m[1] });
});

/* ======================================================================
   Démarrage
   ====================================================================== */

(async () => {
  await SB.loadSports();
  try { const saved = localStorage.getItem('habillage.el'); if (ELEMENTS.some(e => e.key === saved)) key = saved; } catch (e) { /* stockage indisponible */ }
  focusEl(key);
  look = SB.store({ f: 'habillage', defaults: SB.lookDefaults, normalize: SB.fixLook, onChange: renderLook, onStatus: SB.syncStatus });
  score = SB.store({ f: 'score', defaults: () => SB.newScore(), normalize: SB.fixScore, onStatus: SB.syncStatus, onChange: st => { S = st; $('compact').checked = S.compact; } });
})();

SB.subtabs(document.querySelector('[data-subtabs=habillage]'));
SB.accordions();
