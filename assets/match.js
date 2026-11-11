// match.js : grands paramètres du match (admin/match.html).
// Sport, clubs choisis dans la bibliothèque, formation, titulaires / remplaçants, placement sur le
// terrain, compétition, sorties OBS, remise à zéro. L'identité des équipes vient des clubs.
'use strict';

const { $ } = SB;
let S = null, E = null, C = null;          // score, composition, clubs
let score = null, equipes = null, clubs = null;

const act = fn => score.update(fn);
const actE = fn => equipes.update(fn);

function setVal(el, v) {
  if (typeof el === 'string') el = $(el);
  if (document.activeElement !== el && el.value !== v) el.value = v;
}

/* ======================================================================
   Feuilles des deux équipes (construites depuis le modèle)
   ====================================================================== */

const fields = { home: {}, away: {} };
const picked = { home: null, away: null };          // poste sélectionné sur le mini-terrain
for (const [side, heading] of [['home', 'Équipe de gauche'], ['away', 'Équipe de droite']]) {
  const node = $('teamTpl').content.cloneNode(true);
  node.querySelectorAll('[data-f]').forEach(el => { fields[side][el.dataset.f] = el; });
  fields[side].heading.textContent = heading;
  fields[side].squadBox.dataset.acc = 'match.squad.' + side;
  $('teams').append(node);
  const f = fields[side];

  // Choix du club : titulaires = les premiers de l'effectif, remplaçants = les suivants
  f.club.addEventListener('change', e => {
    const club = SB.findClub(C, e.target.value);
    actE(E => {
      E[side] = club ? fillFrom(club) : { club: '', formation: '', starters: [], subs: [], slots: {} };
    });
  });
  // Changer de formation ajuste le nombre de titulaires (ex. volley à 6 + libéro ou à 4) :
  // les titulaires en trop passent remplaçants, les places libres sont prises par les premiers remplaçants
  f.formation.addEventListener('change', e => {
    const v = e.target.value;
    const n = slotCount(SB.sport(S.sport), v);
    actE(E => { E[side].formation = v; E[side].slots = {}; resize(E[side], n); });
  });
  f.resetSlots.onclick = () => actE(E => { E[side].slots = {}; });
  f.autofill.onclick = () => {
    const club = SB.findClub(C, E[side].club);
    if (club) actE(E => { E[side] = fillFrom(club, E[side].formation); });
  };

  // Effectif : T (titulaire) / R (remplaçant), un clic de plus retire le joueur
  f.squad.addEventListener('click', e => {
    const b = e.target.closest('button[data-role]');
    if (!b) return;
    const pid = b.closest('[data-pid]').dataset.pid, role = b.dataset.role;
    actE(E => {
      const t = E[side];
      const was = t.starters.includes(pid) ? 'T' : t.subs.includes(pid) ? 'R' : '';
      t.starters = t.starters.filter(x => x !== pid);
      t.subs = t.subs.filter(x => x !== pid);
      if (was !== role) (role === 'T' ? t.starters : t.subs).push(pid);
      for (const k in t.slots) if (t.slots[k] === pid) delete t.slots[k];
    });
  });

  // Mini-terrain : deux clics échangent les joueurs de poste
  f.pitch.addEventListener('click', e => {
    const tok = e.target.closest('[data-slot]');
    if (!tok) return;
    const slot = tok.dataset.slot;
    if (!picked[side] || picked[side] === slot) { picked[side] = picked[side] === slot ? null : slot; render(); return; }
    const a = picked[side];
    picked[side] = null;
    const L = SB.lineup(E, C, side, S.sport);
    const placed = Terrain.place(L.sp, L.formation, L.starters, L.slots);
    const pa = (placed.find(o => o.slot.id === a) || {}).player, pb = (placed.find(o => o.slot.id === slot) || {}).player;
    actE(E => {
      const s = { ...E[side].slots };
      for (const k in s) if ((pa && s[k] === pa.id) || (pb && s[k] === pb.id)) delete s[k];
      // on fige tout le placement actuel, puis on échange les deux postes
      for (const o of placed) if (o.player && o.player !== pa && o.player !== pb) s[o.slot.id] = o.player.id;
      if (pb) s[a] = pb.id;
      if (pa) s[slot] = pa.id;
      E[side].slots = s;
    });
  });
}

// Ajuste le nombre de titulaires : ceux en trop passent remplaçants, les places libres
// sont prises par les premiers remplaçants
function resize(t, n) {
  if (!n) return;
  if (t.starters.length > n) { t.subs = [...t.starters.slice(n), ...t.subs].slice(0, 30); t.starters = t.starters.slice(0, n); }
  else if (t.starters.length < n) { const k = n - t.starters.length; t.starters = [...t.starters, ...t.subs.slice(0, k)]; t.subs = t.subs.slice(k); }
}

// Nombre de joueurs d'une formation (postes du terrain + libéro), sinon celui du sport
function slotCount(sp, formationId) {
  const f = (sp.formations || []).find(f => f.id === formationId) || (sp.formations || [])[0];
  return f ? f.slots.length : (sp.onField || 11);
}

// Composition par défaut d'un club : les N premiers joueurs en titulaires (N = joueurs de la formation)
function fillFrom(club, formation) {
  const sp = SB.sport(S ? S.sport : club.sport);
  const form = formation || ((sp.formations || [])[0] ? sp.formations[0].id : '');
  const n = slotCount(sp, form);
  const ids = club.players.map(p => p.id);
  return {
    club: club.id,
    formation: form,
    starters: ids.slice(0, n), subs: ids.slice(n, n + 30), slots: {}
  };
}

/* ======================================================================
   Rendu des feuilles
   ====================================================================== */

function renderTeams() {
  if (!S || !E || !C) return;
  const sp = SB.sport(S.sport);
  for (const side of ['home', 'away']) {
    const f = fields[side], t = E[side];
    const club = SB.findClub(C, t.club);
    f.heading.closest('.panel').style.borderTop = '4px solid ' + (club ? club.color : 'var(--line)');

    // liste des clubs : ceux du sport du match d'abord
    const key = JSON.stringify([S.sport, C.clubs.map(c => [c.id, c.name, c.sport])]);
    if (f.club.dataset.key !== key) {
      f.club.dataset.key = key;
      const same = C.clubs.filter(c => c.sport === S.sport), other = C.clubs.filter(c => c.sport !== S.sport);
      const sorted = list => [...list].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      f.club.replaceChildren(new Option(C.clubs.length ? '— Choisir un club —' : '— Aucun club : crée-les dans l’onglet Clubs —', ''));
      for (const [label, list] of [[sp.label, same], ['Autres sports', other]]) {
        if (!list.length) continue;
        const g = document.createElement('optgroup');
        g.label = label;
        for (const c of sorted(list)) g.append(new Option(c.name, c.id));
        f.club.append(g);
      }
    }
    setVal(f.club, t.club);
    f.edit.href = 'clubs.html' + (club ? '#' + club.id : '');
    SB.setText(f.warn, club && club.sport !== S.sport ? `Ce club est inscrit en ${SB.sport(club.sport).label}, le match est en ${sp.label}.` : '');

    // formations du sport du match
    const fkey = S.sport;
    if (f.formation.dataset.key !== fkey) {
      f.formation.dataset.key = fkey;
      f.formation.replaceChildren(...(sp.formations || []).map(fo => new Option(fo.label, fo.id)));
    }
    const L = SB.lineup(E, C, side, S.sport);
    setVal(f.formation, L && L.formation ? L.formation.id : '');
    f.formation.disabled = (sp.formations || []).length < 2;
    SB.setText(f.count, L ? `${L.starters.length} / ${L.formation ? L.formation.slots.length : (sp.onField || '—')}` : '—');

    renderPitch(side, L);
    renderSquad(side, club, t);
    SB.setText(f.squadCount, club ? `${t.starters.length} T · ${t.subs.length} R · ${club.players.length} joueurs` : '');
  }
}

function renderPitch(side, L) {
  const box = fields[side].pitch;
  const kind = SB.sport(S.sport).pitch || 'foot';
  box.style.aspectRatio = String(Terrain.ratio(kind, 'half'));
  if (!L || !L.formation) { box.innerHTML = Terrain.svg(kind, 'half'); return; }
  const placed = Terrain.place(L.sp, L.formation, L.starters, L.slots);
  box.innerHTML = Terrain.svg(kind, 'half');
  for (const o of placed) {
    const tok = document.createElement('button');
    tok.className = 'mtok' + (o.slot.bench ? ' bench' : '') + (picked[side] === o.slot.id ? ' sel' : '') + (o.player ? '' : ' empty');
    tok.dataset.slot = o.slot.id;
    tok.style.setProperty('--c', L.club.color);
    if (!o.slot.bench) {
      const pos = Terrain.point('half', 'home', o.slot.x, o.slot.y);
      tok.style.left = pos.left + '%';
      tok.style.top = pos.top + '%';
    }
    tok.innerHTML = '<span class="face"></span><small></small>';
    const face = tok.querySelector('.face');
    if (o.player && o.player.photo) { const img = new Image(); img.src = SB.logoUrl(o.player.photo); face.append(img); }
    else face.textContent = o.player ? (o.player.number || '?') : '+';
    tok.querySelector('small').textContent = o.player ? (o.player.last || o.player.first || '') : (L.sp.positions.find(p => p.id === o.slot.role) || {}).label || '';
    tok.title = (L.sp.positions.find(p => p.id === o.slot.role) || {}).label || '';
    box.append(tok);
  }
}

function renderSquad(side, club, t) {
  const box = fields[side].squad;
  if (!club) { box.innerHTML = '<p class="hint">Choisis un club pour voir son effectif.</p>'; return; }
  if (!club.players.length) { box.innerHTML = `<p class="hint">Aucun joueur dans ce club : ajoute-les dans <a href="clubs.html#${club.id}">l’onglet Clubs</a>.</p>`; return; }
  const sp = SB.sport(club.sport);
  box.replaceChildren(...club.players.map(p => {
    const row = document.createElement('div');
    row.className = 'srow';
    row.dataset.pid = p.id;
    const role = t.starters.includes(p.id) ? 'T' : t.subs.includes(p.id) ? 'R' : '';
    row.innerHTML = '<span class="photo-drop"><img alt=""><i></i></span><b class="n"></b><span class="nm"></span><small></small>'
      + `<span class="seg2"><button class="btn sm${role === 'T' ? ' sel' : ''}" data-role="T" title="Titulaire">T</button>`
      + `<button class="btn sm${role === 'R' ? ' sel' : ''}" data-role="R" title="Remplaçant">R</button></span>`;
    const ph = row.querySelector('.photo-drop');
    ph.style.setProperty('--c', club.color);
    if (p.photo) ph.querySelector('img').src = SB.logoUrl(p.photo); else ph.querySelector('img').hidden = true;
    ph.querySelector('i').textContent = p.photo ? '' : (p.number || '?');
    row.querySelector('.n').textContent = p.number;
    row.querySelector('.nm').textContent = SB.fullName(p) + (p.captain ? ' (C)' : '');
    row.querySelector('small').textContent = (sp.positions.find(x => x.id === p.pos) || {}).label || '';
    return row;
  }));
}

/* ======================================================================
   Sport, compétition, options, sorties, remise à zéro
   ====================================================================== */

let builtFor = null;
function renderScore() {
  const sp = SB.sport(S.sport);
  if (builtFor !== S.sport) {
    builtFor = S.sport;
    $('sports').replaceChildren(...Object.entries(SB.sports()).map(([key, cfg]) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.dataset.sport = key;
      b.textContent = cfg.label;
      return b;
    }));
    const rules = $('rules');
    rules.innerHTML = '<p><strong>Temps réglementaire :</strong> <span></span></p><ul></ul>';
    rules.querySelector('span').textContent = sp.time;
    rules.querySelector('ul').replaceChildren(...sp.rules.map(r => {
      const li = document.createElement('li');
      li.textContent = r;
      return li;
    }));
  }
  document.querySelectorAll('[data-sport]').forEach(b => b.classList.toggle('sel', b.dataset.sport === S.sport));
}

$('title').addEventListener('input', e => { const v = e.target.value; actE(E => { E.title = v; }); });

// Changement de sport (avec confirmation)
let pendingSport = null, sportTimer = null;
function showSportConfirm(key) {
  pendingSport = key;
  clearTimeout(sportTimer);
  $('sportConfirm').classList.toggle('hidden', !key);
  if (key) {
    $('sportConfirmText').textContent = `Passer au ${SB.sport(key).label} ? Le score, le chrono et les sets seront remis à zéro.`;
    sportTimer = setTimeout(() => showSportConfirm(null), 10000);
  }
}
$('sportYes').onclick = () => {
  const key = pendingSport;
  showSportConfirm(null);
  if (!key) return;
  act(S => Object.assign(S, SB.newScore(key, S)));
  // nouvelle formation par défaut, placements oubliés
  const f0 = (SB.sport(key).formations || [])[0];
  const n = slotCount(SB.sport(key), f0 ? f0.id : '');
  actE(E => { for (const side of ['home', 'away']) { E[side].formation = f0 ? f0.id : ''; E[side].slots = {}; if (E[side].club) resize(E[side], n); } });
};
$('sportNo').onclick = () => showSportConfirm(null);

// Inverser les côtés : clubs, scores et compositions
$('swap').onclick = () => {
  const other = { home: 'away', away: 'home' };
  act(S => {
    [S.home, S.away] = [S.away, S.home];
    S.serve = other[S.serve] || '';
    for (const x of [...S.scorers, ...S.sinbins]) x.team = other[x.team];
  });
  actE(E => { [E.home, E.away] = [E.away, E.home]; });
};

// Remise à zéro (avec confirmation)
let resetTimer = null;
function showResetConfirm(show) {
  $('resetBox').classList.toggle('hidden', show);
  $('resetConfirm').classList.toggle('hidden', !show);
  clearTimeout(resetTimer);
  if (show) resetTimer = setTimeout(() => showResetConfirm(false), 8000);
}
$('resetAll').onclick = () => showResetConfirm(true);
$('resetNo').onclick = () => showResetConfirm(false);
$('resetYes').onclick = () => {
  showResetConfirm(false);
  act(S => Object.assign(S, SB.newScore(S.sport, S)));
};

document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || !S) return;
  if (b.dataset.sport && b.dataset.sport !== S.sport) showSportConfirm(b.dataset.sport);
  if (b.dataset.copy) copy($(b.dataset.copy).textContent, b);
});

function copy(text, btn) {
  const done = () => { const t = btn.textContent; btn.textContent = 'Copié ✓'; setTimeout(() => { btn.textContent = t; }, 1500); };
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(done);
  // page non sécurisée (adresse http autre que localhost) : copie par un champ temporaire
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.append(ta);
  ta.select();
  if (document.execCommand('copy')) done();
  ta.remove();
}
$('urlTout').textContent = new URL('../overlay/', location.href).href;
$('urlApercu').textContent = new URL('../overlay/?vue=apercu', location.href).href;

/* ======================================================================
   Stream Deck : clé secrète et adresses des touches (api/action.php)
   ====================================================================== */

let deckKey = '', keyVisible = false, KEYS = {}, lanIp = '';
async function loadKey(post, role = 'cle', off = false) {
  try {
    const r = await fetch('cle.php', post ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, off }) } : { cache: 'no-store' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'code ' + r.status);
    KEYS = j;
    deckKey = j.cle;
    lanIp = j.ip || '';
    renderDeck();
    renderRemote();
  } catch (e) { SB.syncStatus('error', 'clés des accès distants : ' + e.message); }
}

// Adresse d'une page du site, vue depuis un téléphone : « localhost » remplacé par l'adresse
// de l'ordinateur sur le réseau local.
function remoteUrl(path) {
  const u = new URL(path, location.href);
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname) && lanIp) u.hostname = lanIp;
  return u.href;
}

function drawQr(el, text) {
  el.replaceChildren();
  if (!text) return;
  if (window.QRCode) new QRCode(el, { text, width: 168, height: 168, correctLevel: QRCode.CorrectLevel.M });
  else el.textContent = 'QR code indisponible (pas d’internet) : copie le lien.';
}

const shown = {};
function renderRemote() {
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const warn = $('lanWarn');
  warn.classList.toggle('hidden', !local);
  warn.textContent = lanIp
    ? `La régie est ouverte en « ${location.hostname} » : les liens ci-dessous utilisent l'adresse ${lanIp}. Pour qu'un téléphone du même wifi y accède, lance le serveur avec : php -S 0.0.0.0:${location.port || 80}`
    : `La régie est ouverte en « ${location.hostname} » : un téléphone ne peut pas ouvrir ces liens. Ouvre la régie avec l'adresse de ton ordinateur sur le réseau, et lance le serveur avec : php -S 0.0.0.0:${location.port || 80}`;
  const cOn = !!KEYS.client;
  $('clientOn').classList.toggle('hidden', cOn);
  $('clientRenew').classList.toggle('hidden', !cOn);
  $('clientOff').classList.toggle('hidden', !cOn);
  for (const role of ['arbitre', 'client']) {
    const url = KEYS[role] ? remoteUrl(`../${role === 'arbitre' ? 'arbitre' : 'saisie'}/?cle=${KEYS[role]}`) : '';
    $('url' + role[0].toUpperCase() + role.slice(1)).textContent = url || (role === 'client' ? 'Lien désactivé : clique sur « Activer le lien ».' : '—');
    if (shown[role] !== url) { shown[role] = url; drawQr($('qr' + role[0].toUpperCase() + role.slice(1)), url); }
  }
}
$('clientOn').onclick = () => loadKey(true, 'client');
$('clientOff').onclick = () => loadKey(true, 'client', true);
for (const b of document.querySelectorAll('[data-copy]')) b.onclick = e => {
  const role = b.dataset.copy;
  if (KEYS[role]) copy(remoteUrl(`../${role === 'arbitre' ? 'arbitre' : 'saisie'}/?cle=${KEYS[role]}`), e.target);
};
for (const b of document.querySelectorAll('[data-renew]')) b.onclick = () => document.querySelector(`[data-confirm="${b.dataset.renew}"]`).classList.remove('hidden');
for (const b of document.querySelectorAll('[data-no]')) b.onclick = () => document.querySelector(`[data-confirm="${b.dataset.no}"]`).classList.add('hidden');
for (const b of document.querySelectorAll('[data-yes]')) b.onclick = () => {
  document.querySelector(`[data-confirm="${b.dataset.yes}"]`).classList.add('hidden');
  loadKey(true, b.dataset.yes);
};

function renderDeck() {
  if (!deckKey) return;
  const base = new URL('../api/action.php', location.href).href;
  const home = S ? S.home.name : 'gauche', away = S ? S.away.name : 'droite';
  const sp = S ? SB.sport(S.sport) : null;
  const first = sp ? sp.points[0].label : 'Point';
  const actions = [
    [`${first} · ${home}`, 'a=point&equipe=gauche'],
    [`${first} · ${away}`, 'a=point&equipe=droite'],
    [`−1 · ${home}`, 'a=moins&equipe=gauche'],
    [`−1 · ${away}`, 'a=moins&equipe=droite'],
    ...(sp ? sp.points.slice(1).flatMap((p, i) => [
      [`${p.label} (+${p.value}) · ${home}`, `a=point&type=${i + 1}&equipe=gauche`],
      [`${p.label} (+${p.value}) · ${away}`, `a=point&type=${i + 1}&equipe=droite`]
    ]) : []),
    ['Chrono : démarrer / arrêter', 'a=chrono'],
    ['Période suivante', 'a=periode&n=suivante'],
    ['Mi-temps', 'a=statut&v=mi-temps'],
    ['Fin', 'a=statut&v=fin'],
    ['Temps de jeu (retire Mi-temps / Fin)', 'a=statut&v=temps'],
    ...(sp && sp.shot ? [['Horloge des tirs 24 s', 'a=tirs&s=24'], ['Horloge des tirs 14 s', 'a=tirs&s=14']] : []),
    ...SB.SCREENS.map(t => [`Écran plein : ${t.label.toLowerCase()}`, `a=ecran&type=${t.key}`]),
    ['Transition plein écran', 'a=transition'],
    ...SB.WIPES.map(w => [`Transition « ${w.label} »`, `a=transition&style=${w.key}`]),
    ['Transition + scène OBS (remplace Caméra 2 par le nom de ta scène)', 'a=transition&scene=Cam%C3%A9ra%202'],
    ...(sp && sp.karting ? [['Karting : suivre le kart n° 12 (change le numéro)', 'a=kart&suivre=12'], ['Karting : duel entre les karts 12 et 7', 'a=kart&duel=12,7']] : []),
    ['Prendre (aperçu → antenne)', 'a=prendre'],
    ['Tout masquer', 'a=tout_masquer'],
    ...SB.ELEMENTS.map(e => [`Préparer / afficher : ${e.label}`, `a=element&nom=${e.key}`]),
    ['État (score et chrono, pour l’afficher sur une touche)', 'a=etat'],
    // images de touche (api/touche.php) : à afficher sur la touche, pas à « appuyer »
    [`Image : score · ${home}`, 'v=score&equipe=gauche', 'touche'],
    [`Image : score · ${away}`, 'v=score&equipe=droite', 'touche'],
    [`Image : logo · ${home}`, 'v=logo&equipe=gauche', 'touche'],
    [`Image : logo · ${away}`, 'v=logo&equipe=droite', 'touche']
  ];
  const tbase = new URL('../api/touche.php', location.href).href;
  const key = keyVisible ? deckKey : '•'.repeat(8);
  $('deck').replaceChildren(...actions.map(([label, q, kind]) => {
    const b = kind === 'touche' ? tbase : base;
    const row = document.createElement('div');
    row.className = 'out';
    row.innerHTML = '<span class="deck-l"></span><code></code><button class="btn sm">Copier</button>';
    row.querySelector('.deck-l').textContent = label;
    row.querySelector('code').textContent = `${b}?cle=${key}&${q}`;
    row.querySelector('button').onclick = e => copy(`${b}?cle=${deckKey}&${q}`, e.target);
    return row;
  }));
}
$('keyShow').onclick = () => { keyVisible = !keyVisible; $('keyShow').textContent = keyVisible ? 'Masquer la clé' : 'Afficher la clé'; renderDeck(); };
$('keyNew').onclick = () => $('keyConfirm').classList.remove('hidden');
$('keyNo').onclick = () => $('keyConfirm').classList.add('hidden');
$('keyYes').onclick = () => { $('keyConfirm').classList.add('hidden'); loadKey(true); };

/* ======================================================================
   Karting : lien Apex, tracé, démo, noms des pilotes
   ====================================================================== */

let K = null, kart = null, KF = null, kfKey = '', tabs = null;
const isKart = () => !!(S && SB.sport(S.sport).karting);

// Onglet « Course (karting) » à la place de « Équipes et compositions »
function renderKartTabs() {
  const k = isKart();
  const nav = document.querySelector('[data-subtabs=match]');
  nav.querySelector('[data-sub=equipes]').classList.toggle('hidden', k);
  nav.querySelector('[data-sub=karting]').classList.toggle('hidden', !k);
  const sel = nav.querySelector('.sel');
  if (tabs && sel && sel.classList.contains('hidden')) tabs.show(k ? 'karting' : 'equipes');
}

async function apexInfo(url) {
  const r = await fetch('apex.php?url=' + encodeURIComponent(url), { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'code ' + r.status);
  return j;
}
$('kConnect').onclick = async () => {
  const url = $('kUrl').value.trim();
  SB.setText('kErr', '');
  $('kConnect').disabled = true;
  try {
    const j = await apexInfo(url);
    const t = j.tracks.find(t => t.id === j.default) || j.tracks[0] || null;
    kart.update(K => {
      Object.assign(K, { url: j.url, host: j.host, port: j.port, title: j.title, tracks: j.tracks.map(t => ({ id: t.id, title: t.title })) });
      K.track = t || SB.kartDefaults().track;
      K.demo.on = false;
    });
  } catch (e) { SB.setText('kErr', e.message); }
  $('kConnect').disabled = false;
};
$('kTrack').onchange = async e => {
  const id = e.target.value;
  try {
    const j = await apexInfo(K.url);
    const t = j.tracks.find(t => t.id === id);
    if (t) kart.update(K => { K.track = t; });
  } catch (err) { SB.setText('kErr', err.message); }
};
$('kDemo').onclick = () => kart.update(K => {
  K.demo.on = !K.demo.on;
  if (K.demo.on) { K.demo.start = SB.now() + 5000; K.demo.seed = 1 + Math.floor(Math.random() * 999998); }
});
$('kRestart').onclick = () => kart.update(K => { K.demo.on = true; K.demo.start = SB.now() + 5000; K.demo.seed = 1 + Math.floor(Math.random() * 999998); });
for (const b of document.querySelectorAll('[data-kmode]')) b.onclick = () => kart.update(K => { K.demo.mode = b.dataset.kmode; if (K.demo.on) K.demo.start = SB.now() + 5000; });
$('kKarts').addEventListener('change', e => { const v = Math.max(4, Math.min(24, +e.target.value || 12)); kart.update(K => { K.demo.karts = v; if (K.demo.on) K.demo.start = SB.now() + 5000; }); });
$('kLaps').addEventListener('change', e => { const v = Math.max(3, Math.min(200, +e.target.value || 15)); kart.update(K => { K.demo.laps = v; if (K.demo.on) K.demo.start = SB.now() + 5000; }); });

function kartFeed() {
  const key = K && isKart() ? JSON.stringify([K.host, K.port, K.demo]) : '';
  if (key === kfKey) { if (KF) KF.setNames(K.names); return; }
  kfKey = key;
  if (KF) KF.close();
  KF = null;
  if (!key || (!K.port && !K.demo.on)) return renderKartLive();
  KF = Apex.feed(K);
  let t = 0;
  KF.on('change', () => { if (!t) t = setTimeout(() => { t = 0; renderKartLive(); }, 500); });
  KF.on('status', renderKartLive);
}

function renderKart() {
  renderKartTabs();
  if (!K) return;
  setVal('kUrl', K.url);
  const has = !!K.port;
  $('kInfo').innerHTML = has ? `<b>${SB.esc(K.title)}</b> · flux ${SB.esc(K.host)} · port ${K.port}` : '';
  $('kTrackBox').classList.toggle('hidden', !K.tracks.length);
  const tk = JSON.stringify(K.tracks);
  if ($('kTrack').dataset.key !== tk) {
    $('kTrack').dataset.key = tk;
    $('kTrack').replaceChildren(...K.tracks.map(t => new Option(t.title || 'Tracé ' + t.id, t.id)));
  }
  $('kTrack').value = K.track.id;
  $('kDemo').textContent = K.demo.on ? 'Arrêter la démo' : 'Lancer la démo';
  $('kDemo').classList.toggle('red', K.demo.on);
  document.querySelectorAll('[data-kmode]').forEach(b => b.classList.toggle('sel', b.dataset.kmode === K.demo.mode));
  setVal('kKarts', String(K.demo.karts));
  setVal('kLaps', String(K.demo.laps));
  $('kLaps').disabled = K.demo.mode !== 'sprint';
  kartFeed();
  renderKartLive();
}

// État de la connexion et liste des pilotes (noms modifiables)
let namesKey = '';
function renderKartLive() {
  if (!K) return;
  const s = KF ? KF.session() : null;
  const st = !KF ? (K.port ? 'Non connecté' : 'Aucun circuit') : K.demo.on ? 'Démo en cours' : !s.connected ? 'Connexion…' : s.live ? 'En direct · ' + (s.title || 'session') : 'Connecté · pas de session en cours';
  $('kStatus').textContent = st;
  $('kStatus').className = 'kstatus ' + (KF && s.connected && (s.live || K.demo.on) ? 'ok' : KF && s.connected ? 'idle' : '');
  const list = KF ? KF.drivers() : [];
  const nos = [...new Set([...list.map(d => d.no), ...Object.keys(K.names)])].filter(Boolean).sort((a, b) => +a - +b);
  SB.setText('kCount', nos.length ? nos.length + ' karts' : '');
  const key = JSON.stringify(nos.map(no => [no, (list.find(d => d.no === no) || {}).apexName || '']));
  if (key === namesKey) return;
  namesKey = key;
  if (!nos.length) { $('kNames').innerHTML = '<p class="hint">Les karts apparaissent ici dès que la session commence (ou lance la démo).</p>'; return; }
  $('kNames').replaceChildren(...nos.map(no => {
    const d = list.find(x => x.no === no), n = K.names[no] || {};
    const row = document.createElement('div');
    row.className = 'kname';
    row.innerHTML = `<span class="kno"></span><small></small><input type="text" maxlength="30" placeholder="Nom affiché"><input type="text" maxlength="30" placeholder="Équipe">`;
    const k = row.querySelector('.kno');
    k.textContent = no;
    if (d && d.color) { k.style.background = d.color; k.style.color = d.colorText; }
    row.querySelector('small').textContent = d ? d.apexName : '(absent)';
    const [iName, iTeam] = row.querySelectorAll('input');
    iName.value = n.name || ''; iTeam.value = n.team || '';
    const save = () => kart.update(K => {
      const v = { name: iName.value.trim(), team: iTeam.value.trim() };
      if (v.name || v.team) K.names[no] = v; else delete K.names[no];
    });
    iName.addEventListener('change', save);
    iTeam.addEventListener('change', save);
    return row;
  }));
}

/* ======================================================================
   Démarrage
   ====================================================================== */

function render() {
  renderKart();
  if (S) renderScore();
  if (E) setVal('title', E.title);
  renderTeams();
  if (S && E && C) {
    SB.migrateLineups(S, E, C, { clubs, equipes });     // ancien format -> bibliothèque (une seule fois)
    SB.syncIdentity(score, S, E, C);                    // le score suit les clubs choisis
  }
}

tabs = SB.subtabs(document.querySelector('[data-subtabs=match]'));
SB.accordions();
// anciens liens (Studio, version précédente)
if (location.hash === '#compositions') location.hash = '#equipes';

(async () => {
  await SB.loadSports();
  loadKey(false);
  score = SB.store({ f: 'score', defaults: () => SB.newScore(), normalize: SB.fixScore, onStatus: SB.syncStatus, onChange: st => { S = st; render(); renderDeck(); } });
  equipes = SB.store({ f: 'equipes', defaults: SB.newLineups, onStatus: SB.syncStatus, onChange: st => { E = st; render(); } });
  kart = SB.store({ f: 'karting', defaults: SB.kartDefaults, normalize: SB.fixKart, onStatus: SB.syncStatus, onChange: st => { K = st; renderKart(); } });
  clubs = SB.store({ f: 'clubs', defaults: () => ({ clubs: [] }), onStatus: SB.syncStatus, onChange: st => { C = st; render(); } });
})();
