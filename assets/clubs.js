// clubs.js : bibliothèque des clubs (admin/clubs.html).
// Identité (nom, abréviation, couleurs, logo, sport, entraîneur) et effectif (photo, numéro,
// nom, poste, capitaine). Les clubs se choisissent ensuite pour chaque match dans l'onglet Match.
'use strict';

const { $ } = SB;
let C = null, S = null, E = null;          // clubs, score, composition du match
let clubs = null, score = null, equipes = null;
let current = null;                        // identifiant du club affiché

const actC = fn => clubs.update(fn);
const club = () => (C && SB.findClub(C, current)) || null;
const withClub = fn => actC(C => { const c = SB.findClub(C, current); if (c) fn(c); });
const withPlayer = (pid, fn) => withClub(c => { const p = c.players.find(p => p.id === pid); if (p) fn(p, c); });

function setVal(el, v) {
  if (typeof el === 'string') el = $(el);
  if (document.activeElement !== el && el.value !== String(v)) el.value = v;
}

function select(id) {
  current = id;
  closeDelete();
  try { localStorage.setItem('clubs.current', id || ''); } catch (e) { /* stockage indisponible */ }
  if (id && location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
  render();
}

/* ======================================================================
   Envoi d'images : clic ou glisser-déposer sur une zone
   ====================================================================== */

let pickTarget = null;                     // fonction qui reçoit le fichier choisi
function dropZone(el, onFile) {
  el.addEventListener('click', () => { pickTarget = onFile; $('fileInput').click(); });
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', e => {
    e.preventDefault();
    el.classList.remove('over');
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  });
}
$('fileInput').addEventListener('change', e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (f && pickTarget) pickTarget(f);
});

async function sendImage(file, el, opts, apply) {
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) { SB.syncStatus('error', 'format refusé (PNG, JPEG, WebP ou SVG)'); return; }
  el.classList.add('busy');
  try {
    const path = await SB.upload(file, opts);
    apply(path);
  } catch (e) {
    SB.syncStatus('error', e.message);
  }
  el.classList.remove('busy');
}

dropZone($('logoDrop'), f => sendImage(f, $('logoDrop'), { max: 512 }, path => withClub(c => { c.logo = path; })));
$('logoClear').onclick = () => withClub(c => { c.logo = ''; });

/* ======================================================================
   Liste des clubs
   ====================================================================== */

function renderList() {
  const q = $('search').value.trim().toLowerCase();
  const sport = $('sportFilter').value;
  const list = C.clubs
    .filter(c => (!sport || c.sport === sport) && (!q || (c.name + ' ' + c.code).toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const inMatch = id => E && (E.home.club === id || E.away.club === id);
  $('list').replaceChildren(...list.map(c => {
    const b = document.createElement('button');
    b.className = 'clubcard' + (c.id === current ? ' sel' : '');
    b.style.setProperty('--c', c.color);
    b.innerHTML = '<span class="crest"></span><span class="txt"><b></b><small></small></span>';
    const crest = b.querySelector('.crest');
    if (c.logo) { const img = new Image(); img.src = SB.logoUrl(c.logo); crest.append(img); crest.classList.add('img'); }
    else crest.textContent = SB.code(c);
    b.querySelector('b').textContent = c.name || 'Sans nom';
    b.querySelector('small').textContent = `${SB.sport(c.sport).label} · ${c.players.length} joueur${c.players.length > 1 ? 's' : ''}` + (inMatch(c.id) ? ' · match en cours' : '');
    b.onclick = () => select(c.id);
    return b;
  }));
  if (!list.length) $('list').innerHTML = '<p class="hint">Aucun club ne correspond.</p>';
}
$('search').addEventListener('input', () => C && renderList());
$('sportFilter').addEventListener('change', () => C && renderList());

$('newClub').onclick = () => {
  const id = SB.uid();
  const sportKey = $('sportFilter').value || (S && S.sport) || Object.keys(SB.sports())[0];
  actC(C => C.clubs.push({ id, name: 'NOUVEAU CLUB', code: '', color: '#2448ff', color2: '#ffffff', logo: '', sport: sportKey, coach: '', players: [] }));
  select(id);
  setTimeout(() => { $('cName').focus(); $('cName').select(); }, 50);
};

$('dupClub').onclick = () => {
  const c = club();
  if (!c) return;
  const copy = SB.clone(c);
  copy.id = SB.uid();
  copy.name = (c.name + ' (copie)').slice(0, 24);
  copy.players = copy.players.map(p => ({ ...p, id: SB.uid() }));
  actC(C => C.clubs.push(copy));
  select(copy.id);
};

// Suppression (avec confirmation)
function closeDelete() { $('delConfirm').classList.add('hidden'); }
$('delClub').onclick = () => {
  const c = club();
  if (!c) return;
  const used = E && (E.home.club === c.id || E.away.club === c.id);
  $('delText').textContent = `Supprimer ${c.name} et ses ${c.players.length} joueurs ?` + (used ? ' Ce club est utilisé dans le match en cours.' : '');
  $('delConfirm').classList.remove('hidden');
};
$('delNo').onclick = closeDelete;
$('delYes').onclick = () => {
  const id = current;
  actC(C => { C.clubs = C.clubs.filter(c => c.id !== id); });
  select(null);
};

/* ======================================================================
   Fiche du club : identité
   ====================================================================== */

const bindClub = (id, apply) => $(id).addEventListener('input', e => { const v = e.target.value; withClub(c => apply(c, v)); });
bindClub('cName', (c, v) => { c.name = v.toUpperCase(); });
bindClub('cCode', (c, v) => { c.code = v.toUpperCase().trim(); });
bindClub('cColor', (c, v) => { c.color = v; });
bindClub('cColor2', (c, v) => { c.color2 = v; });
bindClub('cCoach', (c, v) => { c.coach = v; });
$('cSport').addEventListener('change', e => { const v = e.target.value; withClub(c => { c.sport = v; }); });

function setImg(img, path) {
  const src = SB.logoUrl(path);
  if (src) { if (img.getAttribute('src') !== src) img.src = src; img.hidden = false; }
  else { img.removeAttribute('src'); img.hidden = true; }
}

/* ======================================================================
   Effectif
   ====================================================================== */

let rosterKey = '';
function buildRoster(c) {
  const sp = SB.sport(c.sport);
  $('roster').replaceChildren(...c.players.map((p, i) => {
    const row = document.createElement('div');
    row.className = 'prow';
    row.dataset.pid = p.id;
    row.innerHTML = `
      <span class="move"><button class="btn sm ghost" data-move="-1" title="Monter">▲</button><button class="btn sm ghost" data-move="1" title="Descendre">▼</button></span>
      <span class="drop photo-drop" title="Photo : glisser ou cliquer"><img alt=""><i></i></span>
      <input type="text" data-k="number" maxlength="3" inputmode="numeric">
      <input type="text" data-k="first" maxlength="30">
      <input type="text" data-k="last" maxlength="30">
      <select data-k="pos"><option value="">—</option></select>
      <input type="checkbox" data-k="captain" title="Capitaine">
      <span class="row" style="gap:4px;flex-wrap:nowrap"><button class="btn sm ghost" data-unphoto title="Retirer la photo">◌</button><button class="btn sm ghost" data-del title="Retirer le joueur">✕</button></span>`;
    for (const pos of sp.positions || []) row.querySelector('select').append(new Option(pos.label, pos.id));
    if (i === 0) row.querySelector('[data-move="-1"]').disabled = true;
    if (i === c.players.length - 1) row.querySelector('[data-move="1"]').disabled = true;

    // édition des champs
    for (const el of row.querySelectorAll('[data-k]')) {
      const k = el.dataset.k;
      el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', e => {
        const v = el.type === 'checkbox' ? el.checked : k === 'number' ? el.value.replace(/\D/g, '') : el.value;
        withPlayer(p.id, (pl, c) => {
          if (k === 'captain' && v) c.players.forEach(x => { x.captain = false; });   // un seul capitaine
          pl[k] = v;
        });
      });
    }
    const zone = row.querySelector('.photo-drop');
    dropZone(zone, f => sendImage(f, zone, { square: true, max: 400 }, path => withPlayer(p.id, pl => { pl.photo = path; })));
    return row;
  }));
}

// Filtre de l'effectif : par poste et par nom (n'affecte que l'affichage)
let posFilter = '', nameFilter = '';
function renderFilter(c) {
  const sp = SB.sport(c.sport);
  const used = (sp.positions || []).filter(pos => c.players.some(p => p.pos === pos.id));
  const key = c.sport + '|' + used.map(p => p.id).join(',');
  const box = $('posFilter');
  if (box.dataset.key !== key) {
    box.dataset.key = key;
    if (posFilter && !used.some(p => p.id === posFilter)) posFilter = '';
    box.replaceChildren(...[{ id: '', label: 'Tous' }, ...used].map(pos => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.dataset.posf = pos.id;
      b.textContent = pos.label;
      return b;
    }));
  }
  box.hidden = used.length < 2;
  box.querySelectorAll('[data-posf]').forEach(b => b.classList.toggle('sel', b.dataset.posf === posFilter));
}
$('posFilter').addEventListener('click', e => {
  const b = e.target.closest('[data-posf]');
  if (!b) return;
  posFilter = b.dataset.posf;
  render();
});
$('pSearch').addEventListener('input', e => { nameFilter = e.target.value.trim().toLowerCase(); render(); });

function updateRoster(c) {
  let shown = 0;
  for (const row of $('roster').children) {
    const p = c.players.find(x => x.id === row.dataset.pid);
    if (!p) continue;
    const name = (p.number + ' ' + SB.fullName(p)).toLowerCase();
    row.hidden = (posFilter && p.pos !== posFilter) || (nameFilter && !name.includes(nameFilter));
    if (!row.hidden) shown++;
    for (const el of row.querySelectorAll('[data-k]')) {
      const k = el.dataset.k;
      if (el.type === 'checkbox') el.checked = !!p[k];
      else setVal(el, p[k] || '');
    }
    const zone = row.querySelector('.photo-drop');
    zone.style.setProperty('--c', c.color);
    setImg(zone.querySelector('img'), p.photo);
    zone.querySelector('i').textContent = p.photo ? '' : (p.number || '?');
    row.querySelector('[data-unphoto]').hidden = !p.photo;
  }
  $('noMatch').classList.toggle('hidden', shown > 0 || !c.players.length);
}

$('roster').addEventListener('click', e => {
  const b = e.target.closest('button');
  const row = e.target.closest('.prow');
  if (!b || !row) return;
  const pid = row.dataset.pid;
  if (b.dataset.move) {
    const d = +b.dataset.move;
    withClub(c => {
      const i = c.players.findIndex(p => p.id === pid), j = i + d;
      if (i < 0 || j < 0 || j >= c.players.length) return;
      [c.players[i], c.players[j]] = [c.players[j], c.players[i]];
    });
  } else if (b.dataset.del !== undefined) {
    withClub(c => { c.players = c.players.filter(p => p.id !== pid); });
  } else if (b.dataset.unphoto !== undefined) {
    withPlayer(pid, p => { p.photo = ''; });
  }
});

$('addPlayer').onclick = () => {
  const id = SB.uid();
  posFilter = ''; nameFilter = ''; $('pSearch').value = '';     // le nouveau joueur doit être visible
  withClub(c => {
    const nums = c.players.map(p => +p.number || 0);
    c.players.push({ id, number: String(Math.max(0, ...nums) + 1), first: '', last: '', pos: '', photo: '', captain: false });
  });
  setTimeout(() => { const el = document.querySelector(`.prow[data-pid="${id}"] [data-k="first"]`); if (el) el.focus(); }, 50);
};

$('pasteAdd').onclick = () => {
  const c = club();
  if (!c) return;
  const sp = SB.sport(c.sport);
  const list = $('paste').value.split('\n').map(l => SB.parsePlayer(l, sp)).filter(Boolean);
  if (!list.length) return;
  const replace = $('pasteReplace').checked;
  withClub(c => {
    if (replace) c.players = [];
    c.players.push(...list);
    if (list.some(p => p.captain)) {
      const cap = list.find(p => p.captain).id;
      c.players.forEach(p => { p.captain = p.id === cap; });
    }
  });
  $('paste').value = '';
};

/* ======================================================================
   Rendu
   ====================================================================== */

function render() {
  if (!C) return;
  renderList();
  if (typeof renderPending === 'function' && PENDING.length) renderPending();
  const c = club();
  $('sheet').classList.toggle('hidden', !c);
  $('empty').classList.toggle('hidden', C.clubs.length > 0);
  if (!c) { rosterKey = ''; return; }

  setVal('cName', c.name);
  setVal('cCode', c.code);
  $('cCode').placeholder = SB.code({ name: c.name, code: '' }) || 'ABC';
  setVal('cColor', c.color);
  setVal('cColor2', c.color2);
  SB.setText('cColorTxt', c.color);
  SB.setText('cColor2Txt', c.color2);
  setVal('cCoach', c.coach);
  setVal('cSport', c.sport);
  for (const img of ['logoImg', 'logoLight', 'logoDark']) setImg($(img), c.logo);
  $('logoDrop').classList.toggle('has', !!c.logo);
  $('logoClear').hidden = !c.logo;
  SB.setText('count', `${c.players.length} joueur${c.players.length > 1 ? 's' : ''}`);

  // l'effectif n'est reconstruit que si la liste change (ajout, retrait, ordre, sport)
  const key = c.id + '|' + c.sport + '|' + c.players.map(p => p.id).join(',');
  if (key !== rosterKey) { rosterKey = key; buildRoster(c); }
  renderFilter(c);
  updateRoster(c);
}

/* ======================================================================
   Démarrage
   ====================================================================== */

function afterLoad() {
  if (!C || !S || !E) return;
  SB.migrateLineups(S, E, C, { clubs, equipes });       // ancien format -> bibliothèque (une seule fois)
  SB.syncIdentity(score, S, E, C);                      // le score suit les clubs du match
}

SB.accordions();

(async () => {
  await SB.loadSports();
  for (const [key, sp] of Object.entries(SB.sports())) {
    $('sportFilter').append(new Option(sp.label, key));
    $('cSport').append(new Option(sp.label, key));
  }
  let saved = location.hash.slice(1);
  if (!saved) try { saved = localStorage.getItem('clubs.current') || ''; } catch (e) { /* stockage indisponible */ }
  current = saved || null;

  clubs = SB.store({
    f: 'clubs', defaults: () => ({ clubs: [] }), onStatus: SB.syncStatus,
    onChange: st => {
      C = st;
      if (!SB.findClub(C, current)) current = C.clubs.length ? [...C.clubs].sort((a, b) => a.name.localeCompare(b.name, 'fr'))[0].id : null;
      render();
      afterLoad();
    }
  });
  score = SB.store({ f: 'score', defaults: () => SB.newScore(), normalize: SB.fixScore, onStatus: SB.syncStatus, onChange: st => { S = st; afterLoad(); } });
  equipes = SB.store({ f: 'equipes', defaults: SB.newLineups, onStatus: SB.syncStatus, onChange: st => { E = st; render(); afterLoad(); } });
})();

/* ======================================================================
   Fiches proposées par le panneau client (saisie/) : accepter ou refuser
   ====================================================================== */

const FIELDS = [['name', 'Nom'], ['code', 'Abréviation'], ['color', 'Couleur principale'], ['color2', 'Couleur secondaire'],
  ['logo', 'Logo'], ['sport', 'Sport'], ['coach', 'Entraîneur']];
const PFIELDS = [['number', 'N°'], ['first', 'prénom'], ['last', 'nom'], ['pos', 'poste'], ['photo', 'photo'], ['captain', 'capitaine']];

// Ce qui change entre la fiche actuelle (old, ou null pour un nouveau club) et la proposition
function diff(old, neu) {
  const out = [];
  const show = (k, v) => k === 'sport' ? SB.sport(v).label : (v || '—');
  if (!old) {
    out.push(`Nouveau club · ${SB.sport(neu.sport).label} · ${neu.players.length} joueur${neu.players.length > 1 ? 's' : ''}`);
    return out;
  }
  for (const [k, label] of FIELDS) {
    if (old[k] === neu[k]) continue;
    out.push(k === 'logo' ? (neu.logo ? 'Logo : nouvelle image' : 'Logo retiré') : `${label} : ${show(k, old[k])} → ${show(k, neu[k])}`);
  }
  const byId = Object.fromEntries(old.players.map(p => [p.id, p]));
  const added = neu.players.filter(p => !byId[p.id]);
  const kept = new Set(neu.players.map(p => p.id));
  const removed = old.players.filter(p => !kept.has(p.id));
  if (added.length) out.push('Ajoutés : ' + added.map(SB.playerLabel).join(', '));
  if (removed.length) out.push('Retirés : ' + removed.map(SB.playerLabel).join(', '));
  for (const p of neu.players) {
    const o = byId[p.id];
    if (!o) continue;
    const ch = PFIELDS.filter(([k]) => o[k] !== p[k]).map(([, l]) => l);
    if (ch.length) out.push(`${SB.playerLabel(p)} : ${ch.join(', ')} modifié${ch.length > 1 ? 's' : ''}`);
  }
  if (!out.length) out.push('Aucune différence avec la fiche actuelle.');
  return out;
}

let PENDING = [];
async function loadPending() {
  try {
    const r = await fetch('propositions.php', { cache: 'no-store' });
    const j = await r.json();
    if (r.ok) { PENDING = j.items; renderPending(); }
  } catch (e) { /* on réessaie plus tard */ }
}

let pendingKey = '';
function renderPending() {
  const key = JSON.stringify([PENDING, C && C.clubs.map(c => c.id)]);
  if (key === pendingKey) return;
  pendingKey = key;
  $('pending').classList.toggle('hidden', !PENDING.length);
  $('pendingCount').textContent = PENDING.length;
  $('pendingList').replaceChildren(...PENDING.slice().sort((a, b) => b.at - a.at).map(p => {
    const c = p.club, old = C ? SB.findClub(C, p.id) : null;
    const row = document.createElement('div');
    row.className = 'prop';
    row.style.setProperty('--c', c.color);
    row.innerHTML = `<span class="crest"></span>
      <div class="prop-t"><b></b> <small></small><ul></ul></div>
      <div class="prop-a"><button class="btn sm primary" data-acc-yes>Accepter</button><button class="btn sm outline-red" data-acc-no>Refuser</button></div>`;
    const crest = row.querySelector('.crest');
    if (c.logo) { const img = new Image(); img.src = SB.logoUrl(c.logo); crest.append(img); crest.classList.add('img'); }
    else crest.textContent = SB.code(c);
    row.querySelector('b').textContent = c.name;
    row.querySelector('small').textContent = (old ? 'Modification' : 'Nouveau club') + ' · envoyé le ' + new Date(p.at * 1000).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    row.querySelector('ul').replaceChildren(...diff(old, c).map(t => Object.assign(document.createElement('li'), { textContent: t })));
    row.querySelector('[data-acc-yes]').onclick = () => decide(p.id, 'accepter', row);
    row.querySelector('[data-acc-no]').onclick = () => decide(p.id, 'refuser', row);
    return row;
  }));
}

async function decide(id, action, row) {
  row.classList.add('busy');
  try {
    const r = await fetch('propositions.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'code ' + r.status);
    PENDING = j.items;
    renderPending();
    if (action === 'accepter') setTimeout(() => select(id), 1200);   // le temps que la bibliothèque se recharge
  } catch (e) {
    SB.syncStatus('error', 'validation : ' + e.message);
    row.classList.remove('busy');
  }
}

loadPending();
setInterval(loadPending, 5000);
