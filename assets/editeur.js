// editeur.js : éditeur des graphiques personnalisés (admin/graphiques.html).
// Liste des graphiques, canevas 1920 × 1080 (glisser, redimensionner), calques et propriétés.
// Le rendu est celui de l'overlay (assets/graphiques.js) : ce qu'on voit ici est ce qui passe à l'antenne.
'use strict';

const { $ } = SB;
let G = null, S = null, E = null;            // graphiques, score (champs en direct), composition (titre)
let store = null;
let cur = null;                              // graphique édité
let sel = null;                              // calque choisi

const act = fn => store.update(fn);
const graphic = () => (G && G.items.find(g => g.id === cur)) || null;
const layerOf = () => { const g = graphic(); return (g && g.layers.find(l => l.id === sel)) || null; };
const withG = fn => act(G => { const g = G.items.find(g => g.id === cur); if (g) fn(g); });
const withL = fn => withG(g => { const l = g.layers.find(l => l.id === sel); if (l) fn(l, g); });

const TYPES = { block: 'Bloc', text: 'Texte', image: 'Image', hatch: 'Hachures' };
const label = l => l.type === 'text' ? (Graph.vars(l.text, graphic()) || l.text || 'Texte') : TYPES[l.type];

function setVal(el, v) {
  if (typeof el === 'string') el = $(el);
  if (document.activeElement !== el && el.value !== String(v)) el.value = v;
}

/* ======================================================================
   Liste des graphiques
   ====================================================================== */

function selectG(id) {
  cur = id;
  sel = null;
  $('delConfirm').classList.add('hidden');
  try { localStorage.setItem('graphiques.cur', id || ''); } catch (e) { /* stockage indisponible */ }
  render();
}

function renderList() {
  SB.setText('gCount', `${G.items.length} / 20`);
  $('gList').replaceChildren(...G.items.map(g => {
    const b = document.createElement('button');
    b.className = 'clubcard' + (g.id === cur ? ' sel' : '');
    b.innerHTML = '<span class="crest">G</span><span class="txt"><b></b><small></small></span>';
    b.querySelector('b').textContent = g.name || 'Sans nom';
    b.querySelector('small').textContent = `${g.layers.length} calque${g.layers.length > 1 ? 's' : ''}`;
    b.style.setProperty('--c', 'var(--accent)');
    b.onclick = () => selectG(g.id);
    return b;
  }));
}

$('newG').onclick = () => {
  if (G.items.length >= 20) return SB.syncStatus('error', '20 graphiques au plus');
  const g = Graph.TEMPLATES[$('template').value]();
  g.id = SB.uid();
  act(G => G.items.push(g));
  selectG(g.id);
};
$('dupG').onclick = () => {
  const g = graphic();
  if (!g || G.items.length >= 20) return;
  const copy = SB.clone(g);
  copy.id = SB.uid();
  copy.name = (g.name + ' (copie)').slice(0, 40);
  copy.layers.forEach(l => { l.id = SB.uid(); });
  act(G => G.items.push(copy));
  selectG(copy.id);
};
$('delG').onclick = () => {
  const g = graphic();
  if (!g) return;
  SB.setText('delText', `Supprimer « ${g.name} » ?`);
  $('delConfirm').classList.remove('hidden');
};
$('delNo').onclick = () => $('delConfirm').classList.add('hidden');
$('delYes').onclick = () => {
  const id = cur;
  act(G => { G.items = G.items.filter(g => g.id !== id); });
  selectG(null);
};
$('gName').addEventListener('input', e => { const v = e.target.value; withG(g => { g.name = v; }); });
$('gAnim').addEventListener('change', e => { const v = e.target.value; withG(g => { g.anim = v; }); });

/* ======================================================================
   Canevas
   ====================================================================== */

const stage = $('stage'), canvas = $('canvas');
const k = () => stage.clientWidth / 1920;
new ResizeObserver(() => {
  canvas.style.transform = `scale(${k()})`;
  stage.style.height = Math.round(1080 * k()) + 'px';
}).observe(stage);

let canvasKey = '';
function renderCanvas(force) {
  const g = graphic();
  if (!g) { canvas.replaceChildren(); canvasKey = ''; return; }
  const key = JSON.stringify([g, S && [S.home.color, S.away.color, S.home.logo, S.away.logo]]);
  if (key === canvasKey && !force) return;
  canvasKey = key;
  Graph.render(canvas, g, S, E);
}

// Cadre du calque choisi (d'après ses coordonnées)
function placeBox(l) {
  const box = $('box');
  if (!l) { box.hidden = true; return; }
  const kk = k();
  Object.assign(box.style, { left: l.x * kk + 'px', top: l.y * kk + 'px', width: l.w * kk + 'px', height: l.h * kk + 'px' });
  SB.setText('boxName', label(l));
  box.hidden = false;
}

// Aimantation : centre de l'écran et cadre de sécurité (5 %)
const SNAP_X = [96, 960, 1824], SNAP_Y = [54, 540, 1026], SNAP = 10;
function snap(r) {
  let gx = null, gy = null;
  for (const line of SNAP_X) for (const x of [r.x, r.x + r.w / 2, r.x + r.w]) if (gx === null && Math.abs(x - line) < SNAP) { r.x += line - x; gx = line; }
  for (const line of SNAP_Y) for (const y of [r.y, r.y + r.h / 2, r.y + r.h]) if (gy === null && Math.abs(y - line) < SNAP) { r.y += line - y; gy = line; }
  return { gx, gy };
}
function guides(gx, gy) {
  const kk = k();
  $('gx').hidden = gx === null; if (gx !== null) $('gx').style.left = gx * kk + 'px';
  $('gy').hidden = gy === null; if (gy !== null) $('gy').style.top = gy * kk + 'px';
}
guides(null, null);

let drag = null;
function startDrag(e, resize) {
  const l = layerOf();
  if (!l) return;
  e.preventDefault();
  drag = { x: e.clientX, y: e.clientY, start: { x: l.x, y: l.y, w: l.w, h: l.h }, r: { x: l.x, y: l.y, w: l.w, h: l.h }, resize };
  window.addEventListener('pointermove', moveDrag);
  window.addEventListener('pointerup', endDrag, { once: true });
}
function moveDrag(e) {
  if (!drag) return;
  const kk = k(), mx = (e.clientX - drag.x) / kk, my = (e.clientY - drag.y) / kk, st = drag.start;
  const r = { ...st };
  if (drag.resize) {
    r.w = Math.max(4, Math.round(st.w + mx));
    r.h = e.shiftKey ? Math.max(4, Math.round(r.w * st.h / st.w)) : Math.max(4, Math.round(st.h + my));
    guides(null, null);
  } else {
    r.x = Math.round(st.x + mx);
    r.y = Math.round(st.y + my);
    const g = snap(r);
    guides(g.gx, g.gy);
  }
  drag.r = r;
  const d = canvas.querySelector(`[data-layer="${sel}"]`);
  if (d) Object.assign(d.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
  placeBox({ ...layerOf(), ...r });
}
function endDrag() {
  window.removeEventListener('pointermove', moveDrag);
  if (!drag) return;
  const r = drag.r;
  drag = null;
  guides(null, null);
  withL(l => Object.assign(l, r));
}

canvas.addEventListener('pointerdown', e => {
  const d = e.target.closest('[data-layer]');
  selectLayer(d ? d.dataset.layer : null);
  if (d) startDrag(e, false);
});
$('box').addEventListener('pointerdown', e => startDrag(e, e.target === $('handle')));
stage.addEventListener('pointerdown', e => { if (e.target === stage || e.target.classList.contains('safe')) selectLayer(null); });

/* ======================================================================
   Calques
   ====================================================================== */

function selectLayer(id) {
  sel = id;
  renderLayers();
  buildProps();
  renderVars();
  placeBox(layerOf());
}

function renderLayers() {
  const g = graphic();
  if (!g) { $('lList').replaceChildren(); return; }
  // du premier plan (en haut) à l'arrière-plan (en bas)
  $('lList').replaceChildren(...[...g.layers].reverse().map(l => {
    const row = document.createElement('div');
    row.className = 'lrow' + (l.id === sel ? ' sel' : '') + (l.hidden ? ' off' : '');
    row.dataset.lid = l.id;
    row.innerHTML = '<span class="lt"></span><span class="ln"></span>'
      + '<button class="btn sm ghost" data-la="hide" title="Masquer / afficher">◐</button>'
      + '<button class="btn sm ghost" data-la="up" title="Premier plan">▲</button>'
      + '<button class="btn sm ghost" data-la="down" title="Arrière-plan">▼</button>'
      + '<button class="btn sm ghost" data-la="dup" title="Dupliquer">⧉</button>'
      + '<button class="btn sm ghost" data-la="del" title="Supprimer">✕</button>';
    row.querySelector('.lt').textContent = TYPES[l.type];
    row.querySelector('.ln').textContent = l.type === 'text' ? label(l) : '';
    if (l.type === 'text' && /\{v\./.test(l.text)) row.querySelector('.lt').textContent = 'Texte ✎';
    return row;
  }));
}

$('lList').addEventListener('click', e => {
  const row = e.target.closest('.lrow');
  if (!row) return;
  const id = row.dataset.lid, b = e.target.closest('[data-la]');
  if (!b) return selectLayer(id);
  const a = b.dataset.la;
  withG(g => {
    const i = g.layers.findIndex(l => l.id === id);
    if (i < 0) return;
    if (a === 'hide') g.layers[i].hidden = !g.layers[i].hidden;
    if (a === 'up' && i < g.layers.length - 1) [g.layers[i], g.layers[i + 1]] = [g.layers[i + 1], g.layers[i]];
    if (a === 'down' && i > 0) [g.layers[i], g.layers[i - 1]] = [g.layers[i - 1], g.layers[i]];
    if (a === 'dup' && g.layers.length < 30) g.layers.splice(i + 1, 0, { ...SB.clone(g.layers[i]), id: SB.uid(), x: g.layers[i].x + 20, y: g.layers[i].y + 20 });
    if (a === 'del') g.layers.splice(i, 1);
  });
  if (a === 'del' && id === sel) selectLayer(null);
});

document.addEventListener('click', e => {
  const b = e.target.closest('[data-add]');
  if (!b || !graphic()) return;
  if (graphic().layers.length >= 30) return SB.syncStatus('error', '30 calques au plus');
  const l = Graph.layer(b.dataset.add);
  withG(g => g.layers.push(l));
  selectLayer(l.id);
});

/* ======================================================================
   Propriétés du calque choisi
   ====================================================================== */

let propsKey = '';
function colorField(name) {
  return `<div class="lbl">${name}</div><div class="namecolor"><select data-color>`
    + Graph.COLORS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')
    + '<option value="custom">Couleur libre…</option></select><input type="color" data-colorpick></div>';
}

function buildProps() {
  const l = layerOf();
  propsKey = l ? l.id + l.type + JSON.stringify((graphic().vars || []).map(v => [v.id, v.label])) : '';
  SB.setText('propsTitle', l ? 'Propriétés · ' + TYPES[l.type] : 'Propriétés');
  const box = $('props');
  if (!l) { box.innerHTML = '<div class="pb"><p class="hint" style="margin:0">Choisis un calque sur le canevas ou dans la liste.</p></div>'; return; }
  const acc = (key, title, body, open) => `<details class="acc" data-acc="gfx.${key}"${open ? ' open' : ''}><summary>${title}</summary><div class="acc-b">${body}</div></details>`;
  const g = graphic();
  let html = '';
  if (l.type === 'text') {
    const vars = (g.vars || []).map(v => `<option value="{v.${v.id}}">${SB.esc(v.label || v.id)}</option>`).join('');
    html += acc('text', 'Texte', `<input type="text" data-p="text" maxlength="200" aria-label="Texte">
      <select data-insert style="margin-top:6px"><option value="">+ Insérer…</option>
      ${vars ? `<optgroup label="Variables (modifiables dans le Studio)">${vars}</optgroup>` : ''}
      <optgroup label="Champs en direct">${Graph.FIELDS.map(([v, t]) => `<option value="{${v}}">${t}</option>`).join('')}</optgroup></select>
      <button class="btn sm ghost wide" data-makevar style="margin-top:8px" title="Crée une variable avec ce texte : il se changera depuis le Studio">✎ Rendre modifiable dans le Studio</button>`, true);
    html += acc('font', 'Police et alignement', `<div class="two"><div><div class="lbl">Taille</div><input type="number" data-p="size" min="8" max="400"></div>
      <div><div class="lbl">Graisse</div><select data-p="weight">${[400, 500, 600, 700, 800, 900].map(w => `<option value="${w}">${w}</option>`).join('')}</select></div></div>
      <div class="lbl">Largeur des lettres</div>
      <div class="seg seg3"><button class="btn" data-stretch="cond">Étroite</button><button class="btn" data-stretch="normal">Normale</button><button class="btn" data-stretch="wide">Large</button></div>
      <div class="lbl">Alignement</div>
      <div class="seg seg3"><button class="btn" data-align="left">Gauche</button><button class="btn" data-align="center">Centre</button><button class="btn" data-align="right">Droite</button></div>
      <label class="auto"><input type="checkbox" data-p="upper"> Majuscules</label>`, false);
  }
  if (l.type === 'image') {
    html += acc('image', 'Image', `<select data-p="srcKind" aria-label="Image">
        <option value="upload">Image envoyée</option><option value="home.logo">Logo de l'équipe de gauche</option><option value="away.logo">Logo de l'équipe de droite</option></select>
      <div class="drop logo-drop" data-drop style="width:100%;height:110px;margin-top:8px"><span class="drop-hint">Glisse une image ici<br><small>ou clique pour choisir</small></span></div>
      <div class="lbl">Ajustement</div>
      <div class="seg"><button class="btn" data-fit="contain">Entière</button><button class="btn" data-fit="cover">Remplir</button></div>`, true);
  }
  let style = '';
  if (l.type === 'block' || l.type === 'hatch' || l.type === 'text') style += colorField(l.type === 'text' ? 'Couleur du texte' : 'Couleur');
  style += '<div class="lbl">Opacité</div><input type="range" data-p="opacity" min="0" max="1" step="0.05">';
  if (l.type !== 'text') style += '<div class="lbl">Arrondi des coins</div><input type="range" data-p="radius" min="0" max="200" step="1">';
  html += acc('style', 'Couleur et opacité', style, l.type !== 'text' && l.type !== 'image');
  html += acc('pos', 'Position et taille', `<div class="grid4">
      <label class="field">X <input type="number" data-p="x"></label><label class="field">Y <input type="number" data-p="y"></label>
      <label class="field">L <input type="number" data-p="w" min="1"></label><label class="field">H <input type="number" data-p="h" min="1"></label>
    </div>`, false);
  box.innerHTML = html;
  SB.accordions(box);

  // liaisons
  for (const inp of box.querySelectorAll('[data-p]')) {
    const p = inp.dataset.p;
    inp.addEventListener(inp.type === 'checkbox' || inp.tagName === 'SELECT' ? 'change' : 'input', () => {
      let v = inp.type === 'checkbox' ? inp.checked : inp.value;
      if (p === 'srcKind') return withL(l => { l.src = v === 'upload' ? (l.src.startsWith('uploads/') ? l.src : '') : v; });
      if (['x', 'y', 'w', 'h', 'size', 'weight', 'radius'].includes(p)) v = Math.round(+v || 0);
      if (p === 'opacity') v = +v;
      withL(l => { l[p] = v; });
    });
  }
  const cs = box.querySelector('[data-color]'), cp = box.querySelector('[data-colorpick]');
  if (cs) {
    cs.addEventListener('change', () => { const v = cs.value === 'custom' ? cp.value : cs.value; withL(l => { l.color = v; }); });
    cp.addEventListener('input', () => { cs.value = 'custom'; const v = cp.value; withL(l => { l.color = v; }); });
  }
  const ins = box.querySelector('[data-insert]');
  if (ins) ins.addEventListener('change', () => {
    const v = ins.value;
    ins.value = '';
    if (v) withL(l => { l.text = (l.text ? l.text + ' ' : '') + v; });
  });
  const mk = box.querySelector('[data-makevar]');
  if (mk) mk.onclick = () => makeVar();
  const drop = box.querySelector('[data-drop]');
  if (drop) dropZone(drop, f => sendImage(f, drop));
  updateProps();
}

function updateProps() {
  const l = layerOf();
  if (!l) return;
  const g = graphic();
  if (propsKey !== l.id + l.type + JSON.stringify((g.vars || []).map(v => [v.id, v.label]))) return buildProps();
  const mk = $('props').querySelector('[data-makevar]');
  if (mk) mk.hidden = /\{v\.[a-z0-9]+\}/.test(l.text);
  const box = $('props');
  for (const inp of box.querySelectorAll('[data-p]')) {
    const p = inp.dataset.p;
    if (inp.type === 'checkbox') inp.checked = !!l[p];
    else if (p === 'srcKind') setVal(inp, l.src === 'home.logo' || l.src === 'away.logo' ? l.src : 'upload');
    else setVal(inp, l[p]);
  }
  const cs = box.querySelector('[data-color]'), cp = box.querySelector('[data-colorpick]');
  if (cs) {
    const custom = l.color[0] === '#';
    setVal(cs, custom ? 'custom' : l.color);
    if (custom) setVal(cp, l.color);
    cp.hidden = !custom;
  }
  box.querySelectorAll('[data-stretch]').forEach(b => b.classList.toggle('sel', b.dataset.stretch === l.stretch));
  box.querySelectorAll('[data-align]').forEach(b => b.classList.toggle('sel', b.dataset.align === l.align));
  box.querySelectorAll('[data-fit]').forEach(b => b.classList.toggle('sel', b.dataset.fit === l.fit));
  const drop = box.querySelector('[data-drop]');
  if (drop) drop.hidden = l.src === 'home.logo' || l.src === 'away.logo';
}

$('props').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.stretch) withL(l => { l.stretch = b.dataset.stretch; });
  if (b.dataset.align) withL(l => { l.align = b.dataset.align; });
  if (b.dataset.fit) withL(l => { l.fit = b.dataset.fit; });
});

// Envoi d'une image pour le calque choisi
let pickTarget = null;
function dropZone(el, onFile) {
  el.addEventListener('click', () => { pickTarget = onFile; $('fileInput').click(); });
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('over'); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); });
}
$('fileInput').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f && pickTarget) pickTarget(f); });
async function sendImage(file, el) {
  el.classList.add('busy');
  try {
    const path = await SB.upload(file, { max: 1600 });
    withL(l => { l.src = path; });
  } catch (e) { SB.syncStatus('error', e.message); }
  el.classList.remove('busy');
}

/* ======================================================================
   Variables : textes modifiables depuis le Studio ({v.<id>} dans un calque texte)
   ====================================================================== */

function addVar(label, value) {
  const g = graphic();
  if (!g) return null;
  const list = g.vars || [];
  if (list.length >= 12) { SB.syncStatus('error', '12 variables au plus'); return null; }
  const id = Graph.varId(label, list.map(v => v.id));
  withG(g => { g.vars = [...(g.vars || []), { id, label: String(label).slice(0, 24), value: String(value || '').slice(0, 120) }]; });
  return id;
}

// « Rendre modifiable » : le texte du calque devient la valeur d'une nouvelle variable
function makeVar() {
  const l = layerOf();
  if (!l) return;
  const n = (graphic().vars || []).length + 1;
  const id = addVar('Texte ' + n, l.text);
  if (id) withL(l => { l.text = `{v.${id}}`; });
}

let varsKey = '';
function renderVars() {
  const g = graphic();
  const list = (g && g.vars) || [];
  SB.setText('vCount', list.length ? String(list.length) : '');
  const key = JSON.stringify([cur, list.map(v => v.id)]);
  if (key !== varsKey) {
    varsKey = key;
    $('vList').replaceChildren(...list.map(v => {
      const row = document.createElement('div');
      row.className = 'vrow';
      row.dataset.vid = v.id;
      row.innerHTML = '<input type="text" data-v="label" maxlength="24" aria-label="Nom" placeholder="Nom affiché dans le Studio">'
        + '<input type="text" data-v="value" maxlength="120" aria-label="Valeur" placeholder="Valeur">'
        + '<button class="btn sm ghost" data-vins title="Insérer dans le calque texte choisi"></button>'
        + '<button class="btn sm ghost" data-vdel title="Supprimer la variable">✕</button>';
      row.querySelector('[data-vins]').textContent = `{v.${v.id}}`;
      return row;
    }));
    if (!list.length) $('vList').innerHTML = '<p class="hint" style="margin:0">Aucune variable pour ce graphique.</p>';
  }
  const l = layerOf();
  for (const row of $('vList').querySelectorAll('.vrow')) {
    const v = list.find(x => x.id === row.dataset.vid);
    if (!v) continue;
    setVal(row.querySelector('[data-v=label]'), v.label);
    setVal(row.querySelector('[data-v=value]'), v.value);
    row.querySelector('[data-vins]').disabled = !(l && l.type === 'text');
  }
}

$('vList').addEventListener('input', e => {
  const inp = e.target.closest('[data-v]'), row = e.target.closest('.vrow');
  if (!inp || !row) return;
  const k = inp.dataset.v, v = inp.value, id = row.dataset.vid;
  withG(g => { const x = (g.vars || []).find(x => x.id === id); if (x) x[k] = v; });
});
$('vList').addEventListener('click', e => {
  const row = e.target.closest('.vrow');
  if (!row) return;
  const id = row.dataset.vid;
  if (e.target.closest('[data-vdel]')) withG(g => { g.vars = (g.vars || []).filter(x => x.id !== id); });
  if (e.target.closest('[data-vins]')) withL(l => { if (l.type === 'text') l.text = (l.text ? l.text + ' ' : '') + `{v.${id}}`; });
});
const addFromInput = () => {
  const label = $('vNew').value.trim();
  if (!label) return $('vNew').focus();
  if (addVar(label, '')) $('vNew').value = '';
};
$('vAdd').onclick = addFromInput;
$('vNew').addEventListener('keydown', e => { if (e.key === 'Enter') addFromInput(); });

/* ======================================================================
   Rendu, clavier, démarrage
   ====================================================================== */

function render() {
  if (!G) return;
  if (!graphic()) cur = G.items.length ? G.items[0].id : null;
  const g = graphic();
  renderList();
  $('empty').classList.toggle('hidden', !!g);
  for (const id of ['canvasPanel']) $(id).classList.toggle('hidden', !g);
  document.querySelector('.gfx > .col').classList.toggle('hidden', !g);
  if (!g) return;
  setVal('gName', g.name);
  setVal('gAnim', g.anim);
  if (sel && !layerOf()) sel = null;
  renderCanvas();
  renderLayers();
  updateProps();
  renderVars();
  if (!drag) placeBox(layerOf());
}

// Thème de l'habillage appliqué au canevas (accent, plaques, arrondi, police)
function applyTheme(Hraw) {
  const t = SB.fixLook(Hraw).theme, st = canvas.style, dark = t.plates === 'dark';
  st.setProperty('--accent', t.accent);
  st.setProperty('--on-accent', SB.textColor(t.accent));
  st.setProperty('--paper', dark ? '#15161b' : '#ffffff');
  st.setProperty('--ink', dark ? '#f2f3f5' : '#0b0b0f');
  st.setProperty('--r', t.radius + 'px');
  if (t.font !== 'Archivo' && SB.FONTS[t.font] && !document.querySelector(`link[data-font="${t.font}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.dataset.font = t.font;
    link.href = `https://fonts.googleapis.com/css2?family=${SB.FONTS[t.font]}&display=swap`;
    document.head.append(link);
  }
  st.fontFamily = `'${t.font}', 'Archivo', sans-serif`;
}

document.addEventListener('keydown', e => {
  if (SB.typing(e) || !layerOf()) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    const id = sel;
    withG(g => { g.layers = g.layers.filter(l => l.id !== id); });
    return selectLayer(null);
  }
  const step = e.shiftKey ? 10 : 1;
  const m = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (!m) return;
  e.preventDefault();
  withL(l => { l.x += m[0]; l.y += m[1]; });
});

SB.subtabs(document.querySelector('[data-subtabs=graphiques]'));

(async () => {
  await SB.loadSports();
  try { cur = localStorage.getItem('graphiques.cur') || null; } catch (e) { /* stockage indisponible */ }
  store = SB.store({ f: 'graphiques', defaults: () => ({ items: [] }), onChange: st => { G = st; render(); }, onStatus: SB.syncStatus });
  SB.watch('score', st => { S = SB.fixScore(st || SB.newScore()); renderCanvas(); }, 1000);
  SB.watch('equipes', st => { E = st; }, 3000);
  SB.watch('habillage', applyTheme, 2000);
  setInterval(() => { if (graphic()) Graph.update(canvas, S, E); }, 250);
})();
