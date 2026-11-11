// studio.js : page principale de la régie (admin/index.html).
// Moniteurs aperçu / programme, bouton Prendre, et une carte par élément avec ses réglages.
// Les grands paramètres du match (sport, équipes, compositions) sont dans match.js.
'use strict';

const { $ } = SB;
let S = null;          // score
let I = null;          // infos (bandeau nom, remplacement, carton, défilant)
let A = null;          // antenne
let E = null;          // composition du match (clubs choisis, titulaires…)
let CL = null;         // bibliothèque des clubs (lecture seule ici)
let equipesSt = null;
let GR = null;         // graphiques personnalisés (variables modifiables ici)
let store = null, infos = null, scn = null, grStore = null;

const act = fn => store.update(fn);
const actI = fn => infos.update(fn);

function setVal(id, v) {
  const el = typeof id === 'string' ? $(id) : id;
  if (document.activeElement !== el && el.value !== v) el.value = v;
}

/* ======================================================================
   Antenne : moniteurs, Prendre, interrupteurs des cartes
   ====================================================================== */

for (const frame of document.querySelectorAll('.screen iframe')) SB.monitor(frame);

// ---------- Barre des éléments (tuiles) et onglets de réglages ----------
$('elbar').replaceChildren(...SB.ELEMENTS.map((e, i) => {
  const b = document.createElement('button');
  b.className = 'tile';
  b.dataset.toggle = e.key;
  b.innerHTML = '<b></b><kbd></kbd><span class="lamps"><span class="lamp-p">Aperçu</span><span class="lamp-l">Antenne</span></span><i class="t-warn" hidden></i>';
  b.querySelector('b').textContent = e.label;
  b.querySelector('kbd').textContent = i + 1;
  return b;
}));
// Prendre, aussi au bout de la barre : toujours à portée de main
const take2 = document.createElement('button');
take2.className = 'btn primary take';
take2.innerHTML = 'Prendre <small>Entrée</small>';
take2.onclick = () => take();
$('elbar').append(take2);

// Graphiques personnalisés (onglet Graphiques) : une tuile, un onglet et une carte chacun.
// La carte montre les variables du graphique, modifiables ici sans passer par l'éditeur.
let graphicsKey = '';
function graphicTiles(GR) {
  const items = (GR && GR.items) || [];
  const key = JSON.stringify(items.map(g => [g.id, g.name, (g.vars || []).map(v => [v.id, v.label])]));
  if (key === graphicsKey) return renderGraphicPanes();
  graphicsKey = key;
  document.querySelectorAll('.tile.gtile, [data-pane^="g-"], .pane.gpane').forEach(t => t.remove());
  for (const g of items) {
    const b = document.createElement('button');
    b.className = 'tile gtile';
    b.dataset.toggle = 'g-' + g.id;
    b.innerHTML = '<b></b><span class="lamps"><span class="lamp-p">Aperçu</span><span class="lamp-l">Antenne</span></span>';
    b.querySelector('b').textContent = g.name || 'Graphique';
    $('elbar').append(b);

    const tab = document.createElement('button');
    tab.dataset.pane = 'g-' + g.id;
    tab.textContent = g.name || 'Graphique';
    $('stabs').append(tab);

    const card = document.createElement('section');
    card.className = 'panel el pane gpane';
    card.dataset.el = 'g-' + g.id;
    card.innerHTML = `<div class="elh">
        <span class="lamps"><span class="lamp-p">Aperçu</span><span class="lamp-l">Programme</span></span>
        <h2></h2><span class="spacer"></span><button class="btn air" data-toggle="g-${g.id}"></button>
      </div><div class="pb"></div>`;
    card.querySelector('h2').textContent = g.name || 'Graphique';
    const pb = card.querySelector('.pb');
    for (const v of g.vars || []) {
      const f = document.createElement('div');
      f.className = 'vfield';
      f.innerHTML = '<div class="lbl"></div><input type="text" maxlength="120">';
      f.querySelector('.lbl').textContent = v.label || v.id;
      const inp = f.querySelector('input');
      inp.dataset.gvar = g.id + '.' + v.id;
      inp.addEventListener('input', () => {
        const val = inp.value;
        grStore.update(GR => {
          const it = GR.items.find(x => x.id === g.id), x = it && (it.vars || []).find(x => x.id === v.id);
          if (x) x.value = val;
        });
      });
      pb.append(f);
    }
    const foot = document.createElement('p');
    foot.className = 'hint';
    foot.innerHTML = (g.vars || []).length
      ? 'En mode studio, le texte à l’antenne change au prochain « Prendre ». <a href="graphiques.html">Modifier le graphique</a>'
      : 'Ce graphique n’a pas de texte modifiable. Ajoute des variables dans l’onglet <a href="graphiques.html">Graphiques</a>.';
    pb.append(foot);
    $('settings').append(card);
  }
  const want = savedPane && savedPane.startsWith('g-') ? savedPane : currentPane;
  savedPane = null;
  showPane(document.querySelector(`.pane[data-el="${want}"]`) ? want : 'lower');
  renderGraphicPanes();
  if (A) renderScene(A);
}

function renderGraphicPanes() {
  if (!GR) return;
  for (const inp of document.querySelectorAll('[data-gvar]')) {
    const [gid, vid] = inp.dataset.gvar.split('.');
    const g = GR.items.find(x => x.id === gid), v = g && (g.vars || []).find(x => x.id === vid);
    if (v) setVal(inp, v.value);
  }
}

// Onglets : un par élément qui a des réglages (le score a sa console, toujours visible)
const PANES = ['k-tower', 'k-bar', 'k-map', 'k-driver', 'k-duel', 'k-results', 'lower', 'sub', 'card', 'ticker', 'equipes', 'ecran', 'replay', 'wipe'];
$('stabs').replaceChildren(...PANES.map(key => {
  const b = document.createElement('button');
  b.dataset.pane = key;
  b.textContent = key === 'wipe' ? 'Transitions' : SB.ELEMENTS.find(e => e.key === key).label;
  return b;
}));

// Écran plein : types ; transitions : styles
$('screenTypes').replaceChildren(...SB.SCREENS.map(t => {
  const b = document.createElement('button');
  b.className = 'btn sm';
  b.dataset.stype = t.key;
  b.textContent = t.label;
  return b;
}));
$('wipeStyles').replaceChildren(...SB.WIPES.map(w => {
  const b = document.createElement('button');
  b.className = 'btn sm';
  b.dataset.wstyle = w.key;
  b.textContent = w.label;
  return b;
}));
// Lance une transition (et change de scène OBS si une scène est donnée)
const wipe = scene => scn && scn.update(A => { A.wipe = { id: A.wipe.id + 1, style: A.wipeStyle, scene: scene || '' }; });
$('wipeGo').onclick = () => wipe('');
$('wipeObs').onchange = e => { const v = e.target.checked; scn.update(A => { A.wipeObs = v; }); };
$('sceneNames').addEventListener('input', e => {
  const v = e.target.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 12);
  scn.update(A => { A.scenes = v; });
});

let currentPane = 'lower';
function showPane(key) {
  if (!PANES.includes(key) && !document.querySelector(`.pane[data-el="${key}"]`)) return;
  currentPane = key;
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.dataset.el === key));
  document.querySelectorAll('[data-pane]').forEach(b => b.classList.toggle('sel', b.dataset.pane === key));
  document.querySelectorAll('.tile').forEach(t => t.classList.toggle('sel', t.dataset.toggle === key));
  try { localStorage.setItem('studio.pane', key); } catch (e) { /* stockage indisponible */ }
}
let savedPane = null;
try { savedPane = localStorage.getItem('studio.pane'); } catch (e) { /* stockage indisponible */ }
showPane(PANES.includes(savedPane) ? savedPane : 'lower');   // un graphique : rouvert dès qu'il est chargé

// La barre reste collée juste sous l'en-tête (qui n'est collant que sur grand écran)
const header = document.querySelector('.top');
new ResizeObserver(() => {
  const sticky = getComputedStyle(header).position === 'sticky';
  document.documentElement.style.setProperty('--top', (sticky ? header.offsetHeight : 0) + 'px');
}).observe(header);

// Prendre : l'aperçu passe à l'antenne. Les compositions et les infos sont figées
// au programme telles quelles, jusqu'au prochain « Prendre ».
let taking = false;
async function take() {
  if (!A || !A.studio || taking) return;
  taking = true;
  SB.replay($('take'), 'go');
  SB.replay(take2, 'go');
  try {
    const [eq, inf, gr] = await Promise.all([SB.read('equipes'), SB.read('infos'), SB.read('graphiques')]);
    scn.update(A => {
      A.program = { ...A.preview };
      A.snap = { equipes: eq.state, infos: inf.state, graphiques: gr.state };
      A.take++;
    });
  } catch (e) { SB.syncStatus('error', e.message); }
  taking = false;
}

// Mode studio (fige le contenu à l'antenne) ou direct (tout passe tout de suite)
async function setStudio(on) {
  try {
    const [eq, inf, gr] = on ? await Promise.all([SB.read('equipes'), SB.read('infos'), SB.read('graphiques')]) : [{ state: null }, { state: null }, { state: null }];
    scn.update(A => {
      A.studio = on;
      A.preview = { ...A.program };
      A.snap = { equipes: eq.state, infos: inf.state, graphiques: gr.state };
    });
  } catch (e) { SB.syncStatus('error', e.message); }
}

function renderScene(state) {
  A = state;
  $('studio').classList.toggle('direct', !A.studio);
  document.body.classList.toggle('direct', !A.studio);
  $('studioBtn').classList.toggle('sel', A.studio);
  $('studioBtn').textContent = A.studio ? 'Mode studio · activé' : 'Mode direct';
  $('pgmMode').textContent = A.studio ? '' : 'Direct';

  // Tuiles et onglets : vert = à l'aperçu, rouge = à l'antenne
  for (const el of document.querySelectorAll('.tile, [data-pane]')) {
    const key = el.dataset.toggle || el.dataset.pane;
    el.classList.toggle('p', !!(A.studio && A.preview[key]));   // !! : toggle(x, undefined) inverserait la classe
    el.classList.toggle('l', !!A.program[key]);
  }

  for (const card of document.querySelectorAll('[data-el]')) {
    const key = card.dataset.el;
    const pvw = !!(A.studio && A.preview[key]), pgm = !!A.program[key];
    card.classList.toggle('p', pvw);
    card.classList.toggle('l', pgm);
    const b = card.querySelector('[data-toggle]');
    if (!b) continue;                                 // carte Transitions : pas d'interrupteur
    b.className = 'btn air ' + (A.studio ? (pvw ? 'green' : '') : (pgm ? 'red' : ''));
    b.textContent = A.studio ? (pvw ? 'Retirer' : 'Préparer') : (pgm ? 'Masquer' : 'Afficher');
    b.title = A.studio ? 'Prépare l’élément à l’aperçu ; « Prendre » l’envoie à l’antenne' : 'Affiche / masque directement à l’antenne';
  }

  document.querySelectorAll('[data-transition]').forEach(b => b.classList.toggle('sel', b.dataset.transition === A.transition));
  const keys = new Set([...Object.keys(A.preview), ...Object.keys(A.program)]);
  const changes = [...keys].filter(k => !!A.preview[k] !== !!A.program[k]).length;
  $('takeNote').textContent = changes ? `${changes} changement${changes > 1 ? 's' : ''} en attente` : 'Aperçu identique au programme';
  $('modeNote').textContent = A.studio
    ? 'Mode studio : « Préparer » met l’élément à l’aperçu (vert), « Prendre » l’envoie à l’antenne (rouge). Les textes des compositions et des infos restent figés à l’antenne jusqu’au prochain « Prendre » ; le score reste toujours en direct.'
    : 'Mode direct : chaque bouton affiche ou masque l’élément immédiatement à l’antenne.';
  // Transitions
  document.querySelectorAll('[data-wstyle]').forEach(b => b.classList.toggle('sel', b.dataset.wstyle === A.wipeStyle));
  $('wipeObs').checked = A.wipeObs;
  if (document.activeElement !== $('sceneNames')) $('sceneNames').value = A.scenes.join('\n');
  const sk = JSON.stringify(A.scenes);
  if ($('sceneBtns').dataset.key !== sk) {
    $('sceneBtns').dataset.key = sk;
    $('sceneBtns').replaceChildren(...(A.scenes.length ? A.scenes.map(name => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.dataset.scene = name;
      b.textContent = name;
      return b;
    }) : [Object.assign(document.createElement('p'), { className: 'hint', textContent: 'Aucune scène : ajoute leurs noms ci-dessous.' })]));
  }
  $('lowerAuto').checked = A.auto.lower;
  $('subAuto').checked = A.auto.sub;
}

$('take').onclick = take;
$('studioBtn').onclick = () => A && setStudio(!A.studio);
// Tout masquer : les 6 éléments et les graphiques personnalisés
$('allOff').onclick = () => scn.hide([...new Set([...SB.ELEMENTS.map(e => e.key), ...Object.keys(A ? A.program : {}), ...Object.keys(A ? A.preview : {})])]);
for (const key of ['lower', 'sub']) {
  $(key + 'Auto').onchange = e => { const v = e.target.checked; scn.update(A => { A.auto[key] = v; }); };
}

/* ======================================================================
   Contenu vide : un élément sans contenu ne s'affiche pas, on le signale sur sa carte
   ====================================================================== */

async function checkContent() {
  try {
    CL = (await SB.read('clubs')).state;
    renderLineups();
  } catch (e) { /* le voyant de synchro signale déjà les erreurs */ }
  if (S && I) {
    const hasLineups = ['home', 'away'].some(side => { const L = SB.lineup(E, CL, side); return L && L.starters.length; });
    const warn = {
      score: '',
      equipes: hasLineups ? '' : 'Compositions vides : rien ne s’affichera. Choisis les clubs et les titulaires dans l’onglet Match.',
      lower: I.lower.title ? '' : 'Aucun nom saisi : rien ne s’affichera.',
      sub: I.sub.in || I.sub.out ? '' : 'Joueurs non renseignés.',
      card: I.card.mode === 'message' && !I.card.text ? 'Message vide.'
        : I.card.mode === 'countdown' && !I.card.time ? 'Heure de début manquante.' : '',
      ticker: I.ticker.items.some(Boolean) ? '' : 'Aucun message : rien ne s’affichera.',
      ecran: '', replay: ''
    };
    for (const el of document.querySelectorAll('[data-warn]')) SB.setText(el, warn[el.dataset.warn]);
    for (const t of document.querySelectorAll('.tile')) {
      const w = t.querySelector('.t-warn');
      if (!w) continue;                              // tuiles des graphiques : pas de voyant
      w.hidden = !warn[t.dataset.toggle];
      w.title = warn[t.dataset.toggle];
    }
  }
  setTimeout(checkContent, 2000);
}

// Carte « Compositions » : résumé + listes de joueurs pour le bandeau nom et le remplacement
let lineupKey = '';
function renderLineups() {
  const key = JSON.stringify([E, CL, S && S.home.name, S && S.away.name]);
  if (key === lineupKey || !S) return;
  lineupKey = key;
  const count = side => { const L = SB.lineup(E, CL, side); return L ? L.starters.length : 0; };
  $('lineupSummary').textContent = E && E.title ? E.title + ' · ' : '';
  $('lineupSummary').textContent += `${S.home.name} : ${count('home')} titulaires · ${S.away.name} : ${count('away')} titulaires`;

  const pick = $('playerPick');
  pick.length = 1;
  for (const side of ['home', 'away']) {
    const list = players(side);
    if (!list.length) continue;
    const group = document.createElement('optgroup');
    group.label = S[side].name;
    for (const line of list) group.append(new Option(line, JSON.stringify([side, line])));
    pick.append(group);
  }
  if (I) fillPlayers(I.sub.team);
}

// Joueurs d'un côté (titulaires puis remplaçants), en lignes « 10 Kylian Mbappé (C) »
const players = side => {
  const L = SB.lineup(E, CL, side);
  return L ? [...L.starters, ...L.subs].map(p => SB.playerLabel(p) + (p.captain ? ' (C)' : '')) : [];
};

// Carte Compositions : disposition à l'écran (face à face, ou une équipe à la fois)
function renderLayout() {
  if (!E) return;
  document.querySelectorAll('[data-layout]').forEach(b => b.classList.toggle('sel', b.dataset.layout === E.layout));
  document.querySelectorAll('[data-focus]').forEach(b => {
    b.classList.toggle('sel', b.dataset.focus === E.focus);
    if (S) SB.setText(b, S[b.dataset.focus].name);
  });
  $('focusBox').classList.toggle('hidden', E.layout !== 'une');
}
function fillPlayers(side) {
  $('players').replaceChildren(...players(side).map(l => new Option(l.replace(/\s*\((c|cap)\)$/i, ''))));
}

/* ======================================================================
   Scoreboard : console de match
   ====================================================================== */

// Historique pour « Annuler » (scores, compteurs, service, sets joués ; pas le chrono)
const history = [];
function remember() {
  history.push({
    home: { ...S.home }, away: { ...S.away }, serve: S.serve,
    history: SB.clone(S.history), scorers: SB.clone(S.scorers), sinbins: SB.clone(S.sinbins)
  });
  if (history.length > 50) history.shift();
  $('undo').disabled = false;
}
function undo() {
  const h = history.pop();
  $('undo').disabled = !history.length;
  if (!h) return;
  act(S => {
    for (const side of ['home', 'away']) {
      for (const k of ['score', 'sets', 'fouls', 'cards']) S[side][k] = h[side][k];
    }
    S.serve = h.serve;
    S.history = h.history;
    S.scorers = h.scorers;
    S.sinbins = h.sinbins;
  });
}

function addPoints(team, value, label, banner) {
  remember();
  const sp = SB.sport(S.sport);
  const minute = SB.minute(S);
  const eventId = S.event.id + 1;
  act(S => {
    S[team].score = Math.max(0, Math.min(999, S[team].score + value));
    if (value > 0 && sp.sets) S.serve = team;
    if (value > 0 && banner) S.event = { id: S.event.id + 1, team, label, player: '', minute };
    if (sp.scorers && value > 0) S.scorers = [...S.scorers, { team, player: '', minute, label }].slice(-40);
    if (sp.scorers && value < 0) {                     // correction : retire le dernier marqueur de l'équipe
      const i = S.scorers.map(x => x.team).lastIndexOf(team);
      if (i >= 0) S.scorers = S.scorers.filter((_, k) => k !== i);
    }
  });
  // Qui a marqué ? Le nom s'ajoute au bandeau et à la liste des marqueurs
  if (sp.scorers && value > 0) {
    openPicker(team, `${label} · qui a marqué ?`, name => act(S => {
      for (let i = S.scorers.length - 1; i >= 0; i--) {
        const x = S.scorers[i];
        if (x.team === team && !x.player && x.minute === minute) { x.player = name; break; }
      }
      if (S.event.id === eventId) S.event.player = name;
    }));
  }
}

// ---------- Choix d'un joueur (depuis les compositions) ----------
let pickerFn = null, pickerTimer = null;
function openPicker(team, title, fn) {
  pickerFn = fn;
  $('pickerTitle').textContent = title + ' — ' + S[team].name;
  const list = players(team);
  $('pickerList').replaceChildren(...list.map(line => {
    const b = document.createElement('button');
    b.className = 'btn sm';
    b.textContent = line.replace(/\s*\((c|cap)\)$/i, '');
    b.onclick = () => pick(SB.playerName(line));
    return b;
  }));
  $('pickerList').classList.toggle('hidden', !list.length);
  $('pickerInput').value = '';
  $('picker').classList.remove('hidden');
  clearTimeout(pickerTimer);
  pickerTimer = setTimeout(closePicker, 20000);
}
function pick(name) {
  if (name && pickerFn) pickerFn(name);
  closePicker();
}
function closePicker() {
  pickerFn = null;
  clearTimeout(pickerTimer);
  $('picker').classList.add('hidden');
}
$('pickerSkip').onclick = closePicker;
$('pickerInput').addEventListener('keydown', e => { if (e.key === 'Enter') pick(e.target.value.trim()); });

// ---------- Exclusions temporaires (carton jaune, 2 minutes) ----------
function addSinbin(team) {
  const sb = SB.sport(S.sport).sinbin;
  const t = SB.now();
  const id = Date.now() % 2000000000;
  remember();
  act(S => {
    S.sinbins = S.sinbins.filter(x => SB.sinbinLeft(S, x, t) > 0);   // on oublie celles qui sont terminées
    S.sinbins.push({ id, team, player: '', endMs: SB.clockMs(S, t) + sb.min * 60000 });
  });
  openPicker(team, sb.label + ' · quel joueur ?', name => act(S => {
    const x = S.sinbins.find(x => x.id === id);
    if (x) x.player = name;
  }));
}
function removeSinbin(id) {
  remember();
  act(S => { S.sinbins = S.sinbins.filter(x => x.id !== +id); });
}

// Compteurs propres à certains sports (affichés selon assets/sports.json)
const STATS = [
  { key: 'sets',  label: 'Sets',           max: 9,  on: sp => !!sp.sets },
  { key: 'fouls', label: 'Fautes',         max: 20, on: sp => !!sp.fouls },
  { key: 'cards', label: 'Cartons rouges', max: 5,  on: sp => !!sp.cards }
];
function addStat(team, key, delta) {
  const max = STATS.find(x => x.key === key).max;
  remember();
  act(S => { S[team][key] = Math.max(0, Math.min(max, S[team][key] + delta)); });
}

function wonSet(team) {
  remember();
  const win = SB.sport(S.sport).sets.win;
  act(S => {
    S[team].sets = Math.min(9, S[team].sets + 1);
    S.history = [...S.history, [S.home.score, S.away.score]].slice(-5);
    S.home.score = S.away.score = 0;
    S.event = { id: S.event.id + 1, team, label: S[team].sets >= win ? 'Victoire' : 'Set' };
  });
}

function toggleClock() {
  if (!SB.hasClock(S)) return;
  const t = SB.now();
  act(S => {
    const c = S.clock;
    if (c.running) { S.shot.baseMs = SB.shotMs(S, t); c.baseMs = SB.clockMs(S, t); c.running = false; }
    else { c.startedAt = S.shot.startedAt = t; c.running = true; S.status = ''; }
  });
}

function setClock(ms) {
  const t = SB.now();
  act(S => { S.clock.baseMs = Math.max(0, Math.min(36000000, ms(S, t))); S.clock.startedAt = t; });
}

function setPeriod(i) {
  act(S => {
    const sp = SB.sport(S.sport);
    S.period = i;
    S.added = 0;
    S.status = '';
    S.clock = { running: false, baseMs: SB.periodStart(S.sport, i), startedAt: 0 };
    S.shot = { baseMs: sp.shot ? sp.shot[0] * 1000 : 0, startedAt: 0 };
    if (sp.fouls) S.home.fouls = S.away.fouls = 0;   // fautes d'équipe remises à zéro à chaque quart-temps
  });
}

// Horloge des tirs : remise à 24 ou 14 secondes
function resetShot(sec) {
  const t = SB.now();
  act(S => { S.shot = { baseMs: sec * 1000, startedAt: t }; });
}

// ---------- Construction des boutons selon le sport ----------
let builtFor = null;
let lastScores = {};

function build() {
  const sp = SB.sport(S.sport);
  builtFor = S.sport;

  $('periods').replaceChildren(...sp.periods.map((p, i) => {
    const b = document.createElement('button');
    b.className = 'btn sm';
    b.dataset.period = i;
    b.textContent = p.name;
    return b;
  }));

  for (const team of ['home', 'away']) {
    const box = $(team + 'Btns');
    box.innerHTML = '';
    sp.points.forEach((p, i) => {
      const b = document.createElement('button');
      b.className = 'btn pts' + (i === 0 ? ' primary' : '');
      b.dataset.team = team;
      b.dataset.point = i;
      b.innerHTML = '<b></b><small></small>';
      b.querySelector('b').textContent = '+' + p.value;
      b.querySelector('small').textContent = p.label;
      box.append(b);
    });
    const m = document.createElement('button');
    m.className = 'btn minus';
    m.dataset.team = team;
    m.dataset.minus = '1';
    m.textContent = '−1';
    box.append(m);

    const stats = $(team + 'Stats');
    stats.innerHTML = '';
    for (const st of STATS.filter(x => x.on(sp))) {
      const row = document.createElement('div');
      row.className = 'setbox';
      row.innerHTML = `<button class="btn sm" data-stat="${st.key}" data-team="${team}" data-delta="-1">−</button>`
        + `<div><div class="lbl"></div><div class="readout" id="${team}-${st.key}">0</div></div>`
        + `<button class="btn sm" data-stat="${st.key}" data-team="${team}" data-delta="1">+</button>`;
      row.querySelector('.lbl').textContent = st.label;
      stats.append(row);
    }
  }

  $('shotBtns').replaceChildren(...(sp.shot || []).map(v => {
    const b = document.createElement('button');
    b.className = 'btn sm';
    b.dataset.shot = v;
    b.textContent = '↺ ' + v;
    return b;
  }));
  $('shotBox').classList.toggle('hidden', !sp.shot);

  document.querySelectorAll('.volley-only').forEach(el => el.classList.toggle('hidden', !sp.sets));
  document.querySelectorAll('.sinbin-btn').forEach(el => el.classList.toggle('hidden', !sp.sinbin));
  $('scorersBox').classList.toggle('hidden', !sp.scorers);
  $('clockPanel').classList.toggle('hidden', !sp.clock);
  $('addedBox').classList.toggle('hidden', !sp.added);
  closePicker();
}

function renderScore(state) {
  S = state;
  if (builtFor !== S.sport) { build(); applySport(); }
  const sp = SB.sport(S.sport);
  const vi = SB.volley(S);

  document.querySelectorAll('[data-period]').forEach(b => b.classList.toggle('sel', +b.dataset.period === S.period));
  document.querySelectorAll('[data-status]').forEach(b => b.classList.toggle('sel', b.dataset.status === S.status));

  for (const side of ['home', 'away']) {
    const t = S[side];
    $(side + 'Team').style.setProperty('--c', t.color);
    SB.setText(side + 'Label', t.name || '—');
    SB.setText(side + 'Score', t.score);
    for (const st of STATS) if ($(`${side}-${st.key}`)) SB.setText(`${side}-${st.key}`, t[st.key]);
    if (lastScores[side] !== undefined && lastScores[side] !== t.score) SB.replay($(side + 'Team'), 'pop');
    lastScores[side] = t.score;
    $(side + 'Serve').classList.toggle('hidden', S.serve !== side);
    if (sp.sinbin) SB.setText(document.querySelector(`[data-sinbin="${side}"]`), '+ ' + sp.sinbin.label);
    $(side + 'Manual').placeholder = 'Score ' + (t.name || side);
    // noms des équipes sur les boutons du bandeau nom et du remplacement
    SB.setText(document.querySelector(`[data-lteam="${side}"]`), t.name);
    SB.setText(document.querySelector(`[data-steam="${side}"]`), t.name);
  }

  if (vi) {
    for (const [side, cap] of [['home', 'Home'], ['away', 'Away']]) {
      $('serve' + cap).textContent = '● ' + (S[side].name || '—');
      $('serve' + cap).className = 'btn' + (S.serve === side ? ' sel' : '');
      $('set' + cap).textContent = 'Set → ' + (S[side].name || '—');
      $('set' + cap).className = 'btn' + (vi.setWon === side ? ' sel pulse' : '');
      $('set' + cap).disabled = !!vi.winner;
    }
    const played = S.history.length ? ' · sets joués : ' + S.history.map(x => x.join('-')).join(', ') : '';
    $('setInfo').textContent = (vi.winner ? `Match terminé (${S[vi.winner].name})` : `Set ${vi.set}, en ${vi.target} points`) + played;
  }

  renderScorers();

  const run = S.clock.running;
  $('toggle').className = 'btn lg wide ' + (run ? 'red' : 'green');
  $('toggle').textContent = run ? '■ Arrêter' : '▶ Démarrer';
  $('clockState').textContent = run ? 'En cours' : 'Arrêté';
  $('clockState').className = run ? 'on' : '';
  SB.setText('added', S.added ? '+' + S.added : '—');
  lineupKey = '';
  renderLineups();
  tick();
}

// Liste des marqueurs (pour corriger un nom ou supprimer une ligne)
function renderScorers() {
  const list = S.scorers;
  $('scorersCount').textContent = list.length ? `(${list.length})` : '';
  const key = JSON.stringify([list, S.home.name, S.away.name, S.home.color, S.away.color]);
  const box = $('scorersList');
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.replaceChildren(...list.map((x, i) => {
    const row = document.createElement('div');
    row.className = 'item';
    row.style.setProperty('--c', S[x.team].color);
    row.innerHTML = '<i class="dot"></i><b class="min"></b><span class="grow"></span><small></small>'
      + `<button class="btn sm ghost" data-edit-scorer="${i}">Nom</button>`
      + `<button class="btn sm ghost" data-del-scorer="${i}">✕</button>`;
    row.querySelector('.min').textContent = x.minute || '—';
    row.querySelector('.grow').textContent = x.player || 'Marqueur non renseigné';
    row.querySelector('small').textContent = `${x.label} · ${SB.code(S[x.team])}`;
    return row;
  }));
}

// Exclusions en cours, avec le temps restant
function renderSinbins() {
  const sp = SB.sport(S.sport);
  const box = $('sinbinList');
  const list = sp.sinbin ? S.sinbins.filter(x => SB.sinbinLeft(S, x) > 0) : [];
  const key = JSON.stringify(list);
  if (box.dataset.key !== key) {
    box.dataset.key = key;
    box.replaceChildren(...list.map(x => {
      const row = document.createElement('div');
      row.className = 'item';
      row.style.setProperty('--c', sp.sinbin.color);
      row.innerHTML = '<i class="dot"></i><b class="min" data-left></b><span class="grow"></span>'
        + `<button class="btn sm ghost" data-del-sinbin="${x.id}">✕</button>`;
      row.querySelector('.grow').textContent = sp.sinbin.label + ' · ' + (x.player || 'Joueur') + ' · ' + S[x.team].name;
      row.dataset.id = x.id;
      return row;
    }));
  }
  for (const row of box.children) {
    const x = list.find(x => String(x.id) === row.dataset.id);
    if (x) SB.setText(row.querySelector('[data-left]'), SB.fmt(SB.sinbinLeft(S, x) + 999));
  }
}

// Chrono, 10 fois par seconde
function tick() {
  if (!S) return;
  renderSinbins();
  if (!SB.hasClock(S)) return;
  const sp = SB.sport(S.sport);
  const ms = SB.clockMs(S);
  const down = sp.clock === 'down';
  const end = SB.periodEnd(S.sport, S.period);
  SB.setText('clockBig', SB.fmt(ms, down));
  $('clockBox').classList.toggle('run', S.clock.running && !(down && ms === 0));
  $('clockBox').classList.toggle('end', down && ms === 0);
  SB.setText('clockEnd', down ? '' : (ms > end ? '+' + SB.fmt(ms - end) : 'Fin à ' + SB.fmt(end)));

  if (sp.shot) {
    const shot = SB.shotMs(S);
    SB.setText('shotBig', shot < 5000 ? (Math.floor(shot / 100) / 10).toFixed(1) : Math.ceil(shot / 1000));
    $('shotBig').style.color = shot <= 5000 ? 'var(--red)' : '';
  }

  // Chrono décroissant arrivé à zéro : on l'arrête (fin de période)
  if (down && S.clock.running && ms === 0) {
    const t = SB.now();
    act(S => {
      if (!S.clock.running) return;
      S.shot.baseMs = SB.shotMs(S, t);
      S.clock.running = false;
      S.clock.baseMs = 0;
    });
  }
}

$('undo').onclick = undo;
$('toggle').onclick = toggleClock;
$('resetClock').onclick = () => setPeriod(S.period);
$('applyTime').onclick = () => {
  const ms = ((Number($('setMin').value) || 0) * 60 + (Number($('setSec').value) || 0)) * 1000;
  setClock(() => ms);
  $('setMin').value = $('setSec').value = '';
};
$('setHome').onclick = () => wonSet('home');
$('setAway').onclick = () => wonSet('away');
$('applyScore').onclick = () => {
  const v = {};
  for (const side of ['home', 'away']) {
    const champ = $(side + 'Manual');
    if (champ.value !== '') v[side] = Math.max(0, Math.min(999, Math.round(Number(champ.value)) || 0));
    champ.value = '';
  }
  remember();
  act(S => { for (const side in v) S[side].score = v[side]; });
};

/* ======================================================================
   Infos : bandeau nom, remplacement, carton central, bandeau défilant
   ====================================================================== */

const PRESETS = {
  score: ['Mi-temps', 'Fin du match', 'Score final', 'Pause'],
  message: ['Annonce', 'À suivre', 'Interruption'],
  countdown: ['Coup d\'envoi dans', 'Début du match dans', 'Reprise dans']
};

const infosDefaults = () => ({
  lower: { title: '', subtitle: '', team: '' },
  sub: { team: 'home', in: '', out: '' },
  card: { mode: 'score', title: 'Mi-temps', text: '', time: '' },
  ticker: { label: 'Infos', items: [] },
  ecran: { type: 'avant', title: '', text: '', time: '' },
  replay: { label: 'Replay', auto: false, sec: 8 }
});
const hhmm = v => /^\d{1,2}[:h]\d{2}$/.test(v) ? v.replace('h', ':').padStart(5, '0') : '';

const bind = (id, apply) => $(id).addEventListener('input', e => { const v = e.target.value; actI(I => apply(I, v)); });
bind('cardTitle', (I, v) => { I.card.title = v; });
bind('cardText', (I, v) => { I.card.text = v; });
bind('cardTime', (I, v) => { I.card.time = /^\d{1,2}[:h]\d{2}$/.test(v) ? v.replace('h', ':').padStart(5, '0') : ''; });
bind('lowerTitle', (I, v) => { I.lower.title = v; });
bind('lowerSub', (I, v) => { I.lower.subtitle = v; });
bind('subIn', (I, v) => { I.sub.in = v; });
bind('subOut', (I, v) => { I.sub.out = v; });
bind('tickerLabel', (I, v) => { I.ticker.label = v; });
bind('tickerItems', (I, v) => { I.ticker.items = v.split('\n'); });
bind('ecranTitle', (I, v) => { I.ecran.title = v; });
bind('ecranText', (I, v) => { I.ecran.text = v; });
bind('ecranTime', (I, v) => { I.ecran.time = hhmm(v); });
bind('replayLabel', (I, v) => { I.replay.label = v; });
bind('replaySec', (I, v) => { I.replay.sec = Math.max(3, Math.min(60, +v || 8)); });
$('replayAuto').onchange = e => { const v = e.target.checked; actI(I => { I.replay.auto = v; }); };

$('playerPick').onchange = e => {
  if (!e.target.value) return;
  const [side, line] = JSON.parse(e.target.value);
  const captain = /\((c|cap)\)$/i.test(line);
  const m = line.replace(/\s*\((c|cap)\)$/i, '').match(/^(\d{1,3})\s+(.+)$/);
  const name = m ? m[2] : line;
  const sub = [m ? 'N° ' + m[1] : '', S ? S[side].name : '', captain ? 'Capitaine' : ''].filter(Boolean).join(' · ');
  actI(I => { I.lower.title = name; I.lower.subtitle = sub; I.lower.team = side; });
  e.target.value = '';
};

function renderInfos(state) {
  I = state;
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('sel', b.dataset.mode === I.card.mode));
  const presets = $('titlePresets');
  if (presets.dataset.mode !== I.card.mode) {
    presets.dataset.mode = I.card.mode;
    presets.replaceChildren(...PRESETS[I.card.mode].map(t => {
      const b = document.createElement('button');
      b.className = 'btn sm ghost';
      b.dataset.preset = t;
      b.textContent = t;
      return b;
    }));
  }
  $('cardTextBox').classList.toggle('hidden', I.card.mode === 'score');
  $('cardTimeBox').classList.toggle('hidden', I.card.mode !== 'countdown');
  $('cardTextLbl').textContent = I.card.mode === 'countdown' ? 'Sous-titre (facultatif)' : 'Texte';
  setVal('cardTitle', I.card.title);
  setVal('cardText', I.card.text);
  if (document.activeElement !== $('cardTime') && I.card.time) $('cardTime').value = I.card.time;

  document.querySelectorAll('[data-lteam]').forEach(b => b.classList.toggle('sel', b.dataset.lteam === I.lower.team));
  document.querySelectorAll('[data-steam]').forEach(b => b.classList.toggle('sel', b.dataset.steam === I.sub.team));
  setVal('lowerTitle', I.lower.title);
  setVal('lowerSub', I.lower.subtitle);
  setVal('subIn', I.sub.in);
  setVal('subOut', I.sub.out);
  setVal('tickerLabel', I.ticker.label);
  setVal('tickerItems', I.ticker.items.join('\n'));

  // Écran plein
  const ec = I.ecran, st = SB.SCREENS.find(t => t.key === ec.type) || SB.SCREENS[0];
  document.querySelectorAll('[data-stype]').forEach(b => b.classList.toggle('sel', b.dataset.stype === ec.type));
  $('ecranTitle').placeholder = st.key === 'coupure' ? 'Interruption' : st.title;
  setVal('ecranTitle', ec.title);
  setVal('ecranText', ec.text);
  $('ecranTextLbl').textContent = st.key === 'coupure' ? 'Message' : 'Texte (facultatif)';
  $('ecranText').placeholder = st.key === 'coupure' ? 'Nous revenons dans un instant' : st.key === 'avant' ? 'Stade, compétition…' : '';
  $('ecranTimeBox').classList.toggle('hidden', st.key !== 'avant' && st.key !== 'pause');
  $('ecranTimeLbl').textContent = st.key === 'avant' ? 'Début du match à' : 'Reprise à';
  if (document.activeElement !== $('ecranTime')) $('ecranTime').value = ec.time;

  // Replay
  document.querySelectorAll('[data-rlabel]').forEach(b => b.classList.toggle('sel', b.dataset.rlabel === I.replay.label));
  setVal('replayLabel', I.replay.label);
  setVal('replaySec', String(I.replay.sec));
  $('replayAuto').checked = I.replay.auto;
  fillPlayers(I.sub.team);
}

/* ======================================================================
   Clics et raccourcis clavier
   ====================================================================== */

document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;

  // Antenne (tuiles, boutons des cartes) et onglets de réglages
  if (d.pane) return showPane(d.pane);
  if (d.toggle) { showPane(d.toggle); return scn && scn.toggle(d.toggle); }
  if (d.transition) return scn && scn.update(A => { A.transition = d.transition; });
  if (d.wstyle) return scn && scn.update(A => { A.wipeStyle = d.wstyle; });
  if (d.scene) return wipe(d.scene);

  // Compositions : disposition (pas avant la reprise des anciennes compositions, faite par Match / Clubs)
  if (E && equipesSt && E.home.club !== undefined) {
    if (d.layout) return equipesSt.update(E => { E.layout = d.layout; });
    if (d.focus) return equipesSt.update(E => { E.focus = d.focus; });
  }

  // Infos
  if (I) {
    if (d.mode) return actI(I => {
      I.card.mode = d.mode;
      if (!I.card.title || Object.values(PRESETS).flat().includes(I.card.title)) I.card.title = PRESETS[d.mode][0];
    });
    if (d.preset !== undefined) return actI(I => { I.card.title = d.preset; });
    if (d.lteam !== undefined) return actI(I => { I.lower.team = d.lteam; });
    if (d.stype) return actI(I => { I.ecran.type = d.stype; });
    if (d.rlabel) return actI(I => { I.replay.label = d.rlabel; });
    if (d.steam) { fillPlayers(d.steam); return actI(I => { I.sub.team = d.steam; }); }
  }

  // Score
  if (!S) return;
  if (d.point !== undefined) {
    const p = SB.sport(S.sport).points[d.point];
    addPoints(d.team, p.value, p.label, p.banner);
  } else if (d.minus) {
    addPoints(d.team, -1);
  } else if (d.stat) {
    addStat(d.team, d.stat, +d.delta);
  } else if (d.shot) {
    resetShot(+d.shot);
  } else if (d.status !== undefined) {
    act(S => { S.status = d.status; });
  } else if (d.sinbin) {
    addSinbin(d.sinbin);
  } else if (d.delSinbin) {
    removeSinbin(d.delSinbin);
  } else if (d.delScorer !== undefined) {
    remember();
    act(S => { S.scorers = S.scorers.filter((_, k) => k !== +d.delScorer); });
  } else if (d.editScorer !== undefined) {
    const i = +d.editScorer;
    openPicker(S.scorers[i].team, 'Marqueur', name => act(S => { if (S.scorers[i]) S.scorers[i].player = name; }));
  } else if (d.serve) {
    act(S => { S.serve = S.serve === d.serve ? '' : d.serve; });
  } else if (d.period !== undefined) {
    if (+d.period !== S.period) setPeriod(+d.period);
  } else if (d.adj) {
    setClock((S, t) => SB.clockMs(S, t) + d.adj * 1000);
  } else if (d.added) {
    act(S => { S.added = Math.max(0, Math.min(30, S.added + +d.added)); });
  }
});

document.addEventListener('keydown', e => {
  if (SB.typing(e) || e.altKey) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undo(); return; }
  if (e.ctrlKey || e.metaKey) return;

  const n = Number(e.key);
  const els = S ? SB.elementsFor(S.sport) : SB.ELEMENTS;
  if (n >= 1 && n <= Math.min(9, els.length) && scn) {
    e.preventDefault();
    const key = els[n - 1].key;
    showPane(key);
    scn.toggle(key);
    return;
  }
  if (e.key === 'Enter') { e.preventDefault(); take(); return; }
  if (e.key === 'Escape') { $('allOff').click(); return; }

  if (!S) return;
  const sp = SB.sport(S.sport);
  const p = sp.points[0];
  const keys = {
    ' ': toggleClock,
    a: () => addPoints('home', p.value, p.label, p.banner),
    q: () => addPoints('home', -1),
    p: () => addPoints('away', p.value, p.label, p.banner),
    m: () => addPoints('away', -1),
    r: () => sp.shot && resetShot(sp.shot[0]),
    t: () => sp.shot && resetShot(sp.shot[1])
  };
  if (keys[k]) { e.preventDefault(); keys[k](); }
});

/* ======================================================================
   Karting : tuiles du sport, console de course (live timing Apex)
   ====================================================================== */

let K = null, kart = null, KF = null, kfKey = '';
const isKart = () => !!(S && SB.sport(S.sport).karting);

// Tuiles et onglets proposés selon le sport (karting ou sport de balle), numérotés dans l'ordre
function applySport() {
  const keys = new Set(SB.elementsFor(S.sport).map(e => e.key));
  const kartOnly = new Set(SB.ELEMENTS.filter(e => e.kart).map(e => e.key)), ballOnly = new Set(SB.ELEMENTS.filter(e => e.ball).map(e => e.key));
  const off = k => (kartOnly.has(k) || ballOnly.has(k)) && !keys.has(k);
  document.body.classList.toggle('kart', isKart());
  let i = 0;
  for (const t of document.querySelectorAll('#elbar .tile:not(.gtile)')) {
    t.hidden = off(t.dataset.toggle);
    const kbd = t.querySelector('kbd');
    if (kbd) kbd.textContent = !t.hidden && i < 9 ? ++i : '';
  }
  for (const b of document.querySelectorAll('#stabs [data-pane]')) b.hidden = off(b.dataset.pane);
  if (off(currentPane)) showPane(isKart() ? 'k-tower' : 'lower');
  kartFeed();
}

function kartFeed() {
  const key = K && isKart() ? JSON.stringify([K.host, K.port, K.demo]) : '';
  if (key === kfKey) { if (KF) KF.setNames(K.names); return; }
  kfKey = key;
  if (KF) KF.close();
  KF = null;
  if (key && (K.port || K.demo.on)) {
    KF = Apex.feed(K);
    let t = 0;
    KF.on('change', () => { if (!t) t = setTimeout(() => { t = 0; renderKartLive(); }, 250); });
    KF.on('status', renderKartLive);
  }
  renderKartLive();
}

function renderKart(state) {
  K = state;
  kartFeed();
  setVal('kRowsN', String(K.tower.rows));
  SB.setText('kRowsTxt', K.tower.rows);
  document.querySelectorAll('[data-kgap]').forEach(b => b.classList.toggle('sel', b.dataset.kgap === K.tower.mode));
  document.querySelectorAll('[data-knames]').forEach(b => b.classList.toggle('sel', b.dataset.knames === K.tower.names));
  SB.setText('kMapTrack', K.track.title || (K.demo.on ? 'circuit de démonstration' : 'aucun'));
  renderKartLive();
}

const FLAG_LABEL = { green: 'Drapeau vert', yellow: 'Drapeau jaune', red: 'Drapeau rouge', finish: 'Arrivée' };
let kSelKey = '';
function renderKartLive() {
  if (!K || !isKart()) return;
  const s = KF ? KF.session() : null, list = KF ? KF.drivers() : [];
  $('kStatus').textContent = !KF ? (K.port ? 'Non connecté' : 'Aucun circuit') : K.demo.on ? 'Démo' : !s.connected ? 'Connexion…' : s.live ? 'En direct' : 'Pas de session en cours';
  $('kStatus').className = 'kstatus ' + (KF && s.connected && (s.live || K.demo.on) ? 'ok' : KF && s.connected ? 'idle' : '');
  SB.setText('kWarn', !K.port && !K.demo.on ? 'Aucun circuit : colle le lien Apex Timing dans l’onglet Match › Course (karting), ou lance la démo.' : '');
  SB.setText('kTitle', s ? (s.title || K.title || 'Course') : K.title || 'Course');
  $('kFlag').className = 'kflag ' + (s ? s.flag : '');
  $('kFlag').title = s ? FLAG_LABEL[s.flag] || '' : '';
  // tableau des pilotes
  $('kRows').replaceChildren(...list.map(d => {
    const tr = document.createElement('tr');
    tr.className = (d.no === K.focus ? 'focus' : '') + (d.inPit ? ' pit' : '');
    const cells = [d.pos, '', d.name + (d.team && d.team !== d.name ? ' · ' + d.team : ''), d.last, d.best, s.race ? (d.pos === 1 ? '' : d.gap) : (d.pos === 1 ? '' : d.gap), d.laps];
    tr.innerHTML = cells.map((c, i) => `<td class="${['num', 'kc', 'nm', 'num t-' + d.lastCls, 'num t-' + d.bestCls, 'num', 'num'][i]}"></td>`).join('') +
      `<td class="ka"><button class="btn sm${d.no === K.focus ? ' sel' : ''}" data-kfocus="${SB.esc(d.no)}" title="Suivre ce pilote">★</button><button class="btn sm${K.duel[0] === d.no ? ' sel' : ''}" data-kduel="0" data-kno="${SB.esc(d.no)}">A</button><button class="btn sm${K.duel[1] === d.no ? ' sel' : ''}" data-kduel="1" data-kno="${SB.esc(d.no)}">B</button></td>`;
    const tds = tr.querySelectorAll('td');
    cells.forEach((c, i) => { if (i !== 1) tds[i].textContent = c || ''; });
    tds[1].innerHTML = `<span class="kno-b" style="background:${SB.esc(d.color || '')};color:${SB.esc(d.colorText || '')}">${SB.esc(d.no)}</span>`;
    if (d.inPit) tds[2].insertAdjacentHTML('beforeend', ' <span class="pitb">PIT</span>');
    return tr;
  }));
  if (!list.length) $('kRows').innerHTML = `<tr><td colspan="8" class="hint">${KF ? 'En attente des karts…' : ''}</td></tr>`;
  // listes de choix (fiche pilote, duel)
  const key = JSON.stringify([list.map(d => [d.no, d.name]), K.focus, K.duel]);
  if (key !== kSelKey) {
    kSelKey = key;
    const opts = sel => ['<option value="">—</option>', ...list.slice().sort((a, b) => +a.no - +b.no).map(d => `<option value="${SB.esc(d.no)}"${d.no === sel ? ' selected' : ''}>${SB.esc(d.no + ' · ' + d.name)}</option>`)].join('');
    $('kFocus').innerHTML = opts(K.focus);
    $('kDuelA').innerHTML = opts(K.duel[0]);
    $('kDuelB').innerHTML = opts(K.duel[1]);
  }
}
// temps restant : rafraîchi en continu
setInterval(() => {
  if (!KF || !isKart()) return;
  const s = KF.session();
  SB.setText('kRemain', s.dyn1.kind ? s.dyn1.text : s.dyn2.text);
}, 250);

$('kRowsN').addEventListener('input', e => { const v = +e.target.value; kart.update(K => { K.tower.rows = v; }); });
$('kFocus').onchange = e => { const v = e.target.value; kart.update(K => { K.focus = v; }); };
$('kDuelA').onchange = e => { const v = e.target.value; kart.update(K => { K.duel[0] = v; }); };
$('kDuelB').onchange = e => { const v = e.target.value; kart.update(K => { K.duel[1] = v; }); };
document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || !kart) return;
  if (b.dataset.kgap) kart.update(K => { K.tower.mode = b.dataset.kgap; });
  if (b.dataset.knames) kart.update(K => { K.tower.names = b.dataset.knames; });
  if (b.dataset.kfocus !== undefined) { const v = b.dataset.kfocus; kart.update(K => { K.focus = K.focus === v ? '' : v; }); }
  if (b.dataset.kduel !== undefined) { const i = +b.dataset.kduel, v = b.dataset.kno; kart.update(K => { K.duel[i] = K.duel[i] === v ? '' : v; }); }
});

/* ======================================================================
   Démarrage
   ====================================================================== */

SB.accordions();

(async () => {
  await SB.loadSports();
  store = SB.store({ f: 'score', defaults: () => SB.newScore(), normalize: SB.fixScore, onChange: renderScore, onStatus: SB.syncStatus });
  kart = SB.store({ f: 'karting', defaults: SB.kartDefaults, normalize: SB.fixKart, onStatus: SB.syncStatus, onChange: renderKart });
  infos = SB.store({ f: 'infos', defaults: infosDefaults, normalize: SB.fixInfos, onChange: renderInfos, onStatus: SB.syncStatus });
  scn = SB.scene(renderScene, SB.syncStatus);
  grStore = SB.store({ f: 'graphiques', defaults: () => ({ items: [] }), onStatus: SB.syncStatus, onChange: st => { GR = st; graphicTiles(GR); } });
  equipesSt = SB.store({ f: 'equipes', defaults: SB.newLineups, onStatus: SB.syncStatus, onChange: st => { E = st; renderLineups(); renderLayout(); } });
  setInterval(tick, 100);
  checkContent();
})();
