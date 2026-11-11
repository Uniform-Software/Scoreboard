// commun.js : fonctions partagées par la régie (admin/) et les overlays (overlay/).
// Tout est rangé dans l'objet SB pour ne pas mélanger avec le code de chaque page.
'use strict';

const SB = (() => {
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const clone = o => JSON.parse(JSON.stringify(o));
  const params = new URLSearchParams(location.search);

  // ---------- Heure du serveur ----------
  // Le chrono est calculé à partir de l'heure du serveur : tous les écrans affichent
  // le même temps, même si leurs horloges ne sont pas exactement à l'heure.
  let offset = 0, synced = false;
  const now = () => Date.now() + offset;

  function sample(serverTime, t0, t1) {
    if (typeof serverTime !== 'number') return;
    const s = serverTime - (t0 + t1) / 2;          // on tient compte du temps de trajet
    offset = synced ? offset * 0.8 + s * 0.2 : s;  // lissé pour éviter les à-coups
    synced = true;
  }

  // ---------- Sports (assets/sports.json) ----------
  let SPORTS = {};

  async function loadSports() {
    for (;;) {
      try {
        const r = await fetch('../assets/sports.json', { cache: 'no-cache' });
        if (r.ok) return (SPORTS = await r.json());
      } catch (e) { /* on réessaie */ }
      await sleep(2000);
    }
  }

  const sport = key => SPORTS[key] || SPORTS[Object.keys(SPORTS)[0]];
  const period = S => sport(S.sport).periods[S.period] || null;

  // Le chrono est-il affiché ? (pas au volley, ni pendant une période sans durée, ex. tirs au but)
  const hasClock = S => !!sport(S.sport).clock && !!(period(S) && period(S).len);

  // Temps affiché au début d'une période (en ms)
  function periodStart(key, i) {
    const sp = sport(key), p = sp.periods;
    if (!sp.clock || !p[i]) return 0;
    if (sp.clock === 'down') return p[i].len * 60000;
    return p.slice(0, i).reduce((t, x) => t + x.len, 0) * 60000; // croissant : cumul des périodes précédentes
  }

  // Temps affiché à la fin de la période (chrono croissant uniquement, sinon 0)
  function periodEnd(key, i) {
    const sp = sport(key);
    return sp.clock === 'up' && sp.periods[i] ? periodStart(key, i) + sp.periods[i].len * 60000 : 0;
  }

  function clockMs(S, t = now()) {
    const c = S.clock;
    let ms = c.baseMs;
    if (c.running) {
      const d = t - c.startedAt;
      ms += sport(S.sport).clock === 'down' ? -d : d;
    }
    return Math.max(0, ms);
  }

  // Horloge des tirs (basket) : décompte pendant que le chrono de jeu tourne
  function shotMs(S, t = now()) {
    if (!S.shot) return 0;
    let ms = S.shot.baseMs;
    if (S.clock.running) ms -= t - S.shot.startedAt;
    return Math.max(0, ms);
  }

  // 754000 -> "12:34" ; avec tenths, sous la minute : 8400 -> "8.4" (comme en basket)
  function fmt(ms, tenths) {
    if (tenths && ms < 60000) {
      const t = Math.floor(ms / 100);
      return Math.floor(t / 10) + '.' + (t % 10);
    }
    const s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  // Volley : numéro du set, balle de set / de match, set ou match terminé
  function volley(S) {
    const cfg = sport(S.sport).sets;
    if (!cfg) return null;
    const set = S.home.sets + S.away.sets + 1;
    const target = set === cfg.win * 2 - 1 ? cfg.last : cfg.points;
    const info = { set, target, winner: '', setWon: '', setPoint: '', matchPoint: false };
    for (const [a, b] of [['home', 'away'], ['away', 'home']]) {
      const x = S[a].score, y = S[b].score;
      if (S[a].sets >= cfg.win) info.winner = a;
      else if (x >= target && x - y >= 2) info.setWon = a;
      else if (x >= target - 1 && x - y >= 1) { info.setPoint = a; info.matchPoint = S[a].sets === cfg.win - 1; }
    }
    if (info.winner) info.setWon = info.setPoint = '';
    return info;
  }

  // Minute de jeu façon football : 22:13 -> "23'", après la fin de la 1re période : "45+2'"
  function minute(S, t = now()) {
    if (sport(S.sport).clock !== 'up' || !hasClock(S)) return '';
    const ms = clockMs(S, t), end = periodEnd(S.sport, S.period);
    if (end && ms >= end) return `${end / 60000}+${Math.floor((ms - end) / 60000) + 1}'`;
    return `${Math.floor(ms / 60000) + 1}'`;
  }

  // Temps restant d'une exclusion temporaire (elle ne s'écoule que quand le chrono tourne)
  const sinbinLeft = (S, x, t = now()) => Math.max(0, x.endMs - clockMs(S, t));

  // Abréviation d'équipe : celle saisie, sinon les 3 premières lettres du nom
  function code(team) {
    if (team.code) return team.code;
    return team.name.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
  }

  // Nom affiché dans le scoreboard : abréviation en mode compact, sinon nom complet
  const teamLabel = (S, side) => S.compact ? code(S[side]) : S[side].name;

  // « Kylian Mbappé » -> « K. Mbappé » (comme sur les bandeaux des diffuseurs)
  function shortName(full) {
    const w = (full || '').trim().split(/\s+/);
    return w.length < 2 ? w.join('') : w[0][0] + '. ' + w.slice(1).join(' ');
  }

  // Ligne de composition « 10 Kylian Mbappé (C) » -> « Kylian Mbappé »
  const playerName = line => (line || '').replace(/\s*\((c|cap)\)$/i, '').replace(/^\d{1,3}\s+/, '');

  // Image (logo, photo) : envoyée depuis la régie (uploads/…), fichier du dossier logos/, ou adresse https
  const logoUrl = v => !v ? '' : /^https:\/\//.test(v) ? v : v.startsWith('uploads/') ? '../' + v : '../logos/' + v;

  // ---------- Clubs (bibliothèque) et composition du match ----------
  const uid = () => Math.random().toString(36).slice(2, 10) || 'x';        // identifiant court [a-z0-9]
  const findClub = (C, id) => (C && C.clubs.find(c => c.id === id)) || null;
  const fullName = p => [p.first, p.last].filter(Boolean).join(' ');
  const playerLabel = p => [p.number, fullName(p)].filter(Boolean).join(' ');   // « 10 Kylian Mbappé »

  // Composition vide du match (aucun club choisi)
  const newSide = () => ({ club: '', formation: '', starters: [], subs: [], slots: {} });
  const newLineups = () => ({ title: '', layout: 'face', focus: 'home', home: newSide(), away: newSide() });

  // Composition résolue d'un côté : club, formation, titulaires et remplaçants (fiches complètes)
  function lineup(E, C, side, sportKey) {
    const t = E && E[side];
    const club = t && findClub(C, t.club);
    if (!club) return null;
    const sp = sport(sportKey || club.sport);
    const forms = sp.formations || [];
    const byId = id => club.players.find(p => p.id === id);
    return {
      club, sp,
      formation: forms.find(f => f.id === t.formation) || forms[0] || null,
      starters: (t.starters || []).map(byId).filter(Boolean),
      subs: (t.subs || []).map(byId).filter(Boolean),
      slots: t.slots || {}
    };
  }

  // Le score garde une copie de l'identité des clubs choisis (nom, abréviation, couleur, logo) :
  // les overlays n'ont besoin que du score. On la remet à jour dès qu'un club change.
  const identityOf = club => ({ name: club.name.toUpperCase(), code: club.code.toUpperCase(), color: club.color, logo: club.logo });
  function syncIdentity(scoreStore, S, E, C) {
    if (!S || !E || !C || !E.home) return;
    for (const side of ['home', 'away']) {
      const club = findClub(C, E[side] && E[side].club);
      if (!club) continue;
      const id = identityOf(club);
      if (Object.keys(id).some(k => S[side][k] !== id[k])) scoreStore.update(S => Object.assign(S[side], id));
    }
  }

  // Ancien format (avant la bibliothèque) : équipes saisies dans le score, joueurs en lignes de texte.
  // On en fait deux clubs et la composition y fait référence. Ne sert qu'une fois : ensuite
  // la composition a un champ « club ». stores = { clubs, equipes } (SB.store).
  let migrated = false;          // une seule fois par page (les mises à jour ci-dessous relancent le rendu)
  function migrateLineups(S, E, C, stores) {
    if (migrated || !S || !E || !C || !E.home || E.home.club !== undefined) return false;
    migrated = true;
    const sp = sport(S.sport);
    const made = {};
    for (const side of ['home', 'away']) {
      const t = E[side] || {};
      const parse = lines => (lines || []).map(l => parsePlayer(l, sp)).filter(Boolean);
      const starters = parse(t.starters), subs = parse(t.subs);
      const unused = !starters.length && !subs.length && ['DOMICILE', 'EXTÉRIEUR'].includes(S[side].name);
      made[side] = unused ? null : {
        club: {
          id: uid(), name: S[side].name, code: S[side].code || '', color: S[side].color, color2: '#ffffff',
          logo: S[side].logo || '', sport: S.sport, coach: t.coach || '', players: [...starters, ...subs]
        },
        starters: starters.map(p => p.id), subs: subs.map(p => p.id)
      };
    }
    stores.clubs.update(C => { for (const m of [made.home, made.away]) if (m) C.clubs.push(m.club); });
    stores.equipes.update(E => {
      E.layout = 'face';
      E.focus = 'home';
      for (const side of ['home', 'away']) {
        const m = made[side];
        E[side] = { club: m ? m.club.id : '', formation: '', starters: m ? m.starters : [], subs: m ? m.subs : [], slots: {} };
      }
    });
    return true;
  }

  // Une ligne collée (« 10 Kylian Mbappé ATT (C) », ou des colonnes d'Excel) -> fiche joueur
  const POS_ALIASES = { ATT: 'BU', AT: 'BU', ST: 'BU', BU: 'BU', GK: 'GB', G: 'GB', DEF: 'DC', CB: 'DC', LB: 'DG', RB: 'DD',
    MIL: 'MC', CM: 'MC', CDM: 'MDC', CAM: 'MOC', LW: 'AG', RW: 'AD', LM: 'MG', RM: 'MD' };
  function parsePlayer(line, sp) {
    let s = String(line || '').replace(/\t+/g, ' ').trim();
    if (!s) return null;
    const captain = /\((c|cap)\)\s*$/i.test(s);
    s = s.replace(/\s*\((c|cap)\)\s*$/i, '');
    let number = '';
    const m = s.match(/^(\d{1,3})[\s.,;:-]+(.+)$/);
    if (m) { number = m[1]; s = m[2]; }
    const words = s.split(/\s+/);
    const ids = (sp.positions || []).map(p => p.id);
    const tail = words[words.length - 1].toUpperCase();
    let pos = '';
    if (words.length > 1 && (ids.includes(tail) || ids.includes(POS_ALIASES[tail]))) {
      pos = ids.includes(tail) ? tail : POS_ALIASES[tail];
      words.pop();
    }
    return {
      id: uid(), number,
      first: words.length > 1 ? words[0] : '',
      last: words.length > 1 ? words.slice(1).join(' ') : words[0],
      pos, photo: '', captain
    };
  }

  // Envoie une image au serveur (admin/upload.php). Photo : recadrée en carré 400 px (le haut de
  // l'image est privilégié, pour garder le visage). Logo : réduit à 512 px au plus, proportions gardées.
  // to : adresse d'envoi (le panneau client passe par api/saisie.php)
  async function upload(file, { square = false, max = 512, to = 'upload.php' } = {}) {
    let blob = file;
    if (file.type !== 'image/svg+xml') {
      const img = await createImageBitmap(file);
      const side = Math.min(img.width, img.height);
      const sw = square ? side : img.width, sh = square ? side : img.height;
      const sx = square ? (img.width - side) / 2 : 0, sy = square ? (img.height - side) * 0.2 : 0;
      const k = Math.min(1, max / Math.max(sw, sh));
      const c = document.createElement('canvas');
      c.width = Math.round(sw * k);
      c.height = Math.round(sh * k);
      c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      blob = await new Promise(res => c.toBlob(res, 'image/webp', 0.9));
      if (!blob || blob.type !== 'image/webp') blob = await new Promise(res => c.toBlob(res, 'image/png'));
    }
    const fd = new FormData();
    fd.append('file', blob, 'image');
    const r = await fetch(to, { method: 'POST', body: fd });
    const j = await json(r);
    if (!r.ok) throw new Error(j.error || 'code ' + r.status);
    return j.path;
  }

  // ---------- Habillage : thème, position et taille des éléments, options ----------
  // Réglé dans l'onglet Habillage (data/habillage.json), appliqué en direct par les overlays.
  const FONTS = {
    'Archivo': 'Archivo:wdth,wght@62..125,400..900',
    'Barlow Condensed': 'Barlow+Condensed:wght@400;600;700;800;900',
    'Inter': 'Inter:wght@400..900',
    'Oswald': 'Oswald:wght@400..700',
    'Bebas Neue': 'Bebas+Neue'
  };
  const PLACEABLE = ['score', 'lower', 'sub', 'card', 'ticker', 'equipes'];
  const SPEEDS = { slow: 0.6, normal: 1, fast: 1.6 };

  function lookDefaults() {
    return {
      theme: { accent: '#2448ff', plates: 'light', radius: 12, font: 'Archivo', pitch: '#123a2b' },
      layout: Object.fromEntries(PLACEABLE.map(k => [k, { dx: 0, dy: 0, s: 1 }])),
      options: { progress: true, crests: true, hatch: true, banner: true, bannerSec: 5.5, autoHideSec: 8, speed: 'normal', tickerTop: false },
      twitch: { channel: '', max: 8, fade: 0, hideCmd: true, bots: 'nightbot, streamelements, streamlabs, moobot, fossabot, wizebot', minBits: 1,
        alerts: { sub: true, gift: true, raid: true, bits: true }, test: { id: 0, type: 'sub' } }
    };
  }
  function fixLook(H) {
    const d = lookDefaults();
    H = H || {};
    return {
      theme: Object.assign(d.theme, H.theme),
      layout: Object.fromEntries(PLACEABLE.map(k => [k, Object.assign(d.layout[k], H.layout && H.layout[k])])),
      options: Object.assign(d.options, H.options),
      twitch: Object.assign(d.twitch, H.twitch, {
        alerts: Object.assign(d.twitch.alerts, H.twitch && H.twitch.alerts),
        test: Object.assign(d.twitch.test, H.twitch && H.twitch.test)
      })
    };
  }

  let LOOK = lookDefaults(), fontLoaded = 'Archivo', rate = 1;
  function setLook(H) {
    LOOK = fixLook(H);
    const r = document.documentElement.style, t = LOOK.theme, o = LOOK.options;
    if (!params.get('accent')) {
      r.setProperty('--accent', t.accent);
      r.setProperty('--on-accent', textColor(t.accent));
    }
    // plaques sombres : on inverse le noir et le blanc des aplats
    const dark = t.plates === 'dark';
    r.setProperty('--paper', dark ? '#15161b' : '#ffffff');
    r.setProperty('--ink', dark ? '#f2f3f5' : '#0b0b0f');
    r.setProperty('--mist', dark ? '#26282f' : '#eceef2');
    r.setProperty('--r', t.radius + 'px');
    r.setProperty('--pitch', t.pitch);
    if (t.font !== fontLoaded && FONTS[t.font]) {
      fontLoaded = t.font;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${FONTS[t.font]}&display=swap`;
      document.head.append(link);
    }
    r.setProperty('--font', `'${t.font}', 'Archivo', 'Arial Narrow', Arial, sans-serif`);
    for (const k of PLACEABLE) {
      const l = LOOK.layout[k];
      r.setProperty(`--${k}-dx`, l.dx + 'px');
      r.setProperty(`--${k}-dy`, l.dy + 'px');
      r.setProperty(`--${k}-s`, l.s);
    }
    const cl = document.documentElement.classList;
    cl.toggle('no-progress', !o.progress);
    cl.toggle('no-hatch', !o.hatch);
    cl.toggle('ticker-top', o.tickerTop);
    rate = SPEEDS[o.speed] || 1;
  }

  // Vitesse des animations : appliquée à toutes les animations en cours (sauf le défilant)
  (function speedLoop() {
    if (rate !== 1 || document.getAnimations().some(a => a.playbackRate !== 1)) {
      for (const a of document.getAnimations()) {
        const el = a.effect && a.effect.target;
        // bandeau défilant et transitions plein écran (calées sur la vidéo Stinger d'OBS) : vitesse fixe
        const r = el && el.closest && (el.classList.contains('t-move') || el.closest('.no-rate')) ? 1 : rate;
        if (a.playbackRate !== r) a.playbackRate = r;
      }
    }
    requestAnimationFrame(speedLoop);
  })();

  // Overlays : suit l'habillage ; cb(LOOK) après chaque changement
  function watchLook(cb) {
    watch('habillage', H => { setLook(H); if (cb) cb(LOOK); }, 1000);
  }

  // Mode édition (?edit, utilisé par l'éditeur de l'onglet Habillage) : les éléments sont affichés
  // avec un contenu d'exemple, sans passer par l'antenne. window.editFocus(clé) choisit l'élément édité.
  const EDIT = params.has('edit');
  let editKey = 'score';
  const editHooks = [];
  window.editFocus = key => { editKey = key; editHooks.forEach(fn => fn()); };
  const onEdit = fn => editHooks.push(fn);
  function editVisible(key) {
    if (editKey === 'equipes') return key === 'equipes';
    if (key === 'equipes' || key === 'card' || key === 'ecran' || key === 'replay' || key.startsWith('k-')) return key === editKey;
    if (key === 'sub') return editKey === 'sub';
    if (key === 'lower') return editKey !== 'sub';
    return true;                                     // scoreboard et défilant : toujours visibles
  }

  // ---------- Antenne : ce qui est affiché à l'aperçu et au programme ----------
  // Programme = ce qui est à l'antenne. Aperçu = ce qui le sera au prochain « Prendre » (mode studio).
  // Hors mode studio, l'aperçu suit le programme et chaque clic passe directement à l'antenne.
  // ball : sports de balle seulement ; kart : karting seulement ; sinon : tous les sports
  const ELEMENTS = [
    { key: 'score',   label: 'Scoreboard', ball: true },
    { key: 'k-tower', label: 'Classement', kart: true },
    { key: 'k-bar',   label: 'Bandeau course', kart: true },
    { key: 'k-map',   label: 'Mini map', kart: true },
    { key: 'k-driver', label: 'Fiche pilote', kart: true },
    { key: 'k-duel',  label: 'Duel', kart: true },
    { key: 'k-results', label: 'Résultats', kart: true },
    { key: 'equipes', label: 'Compositions', ball: true },
    { key: 'lower',   label: 'Bandeau nom' },
    { key: 'sub',     label: 'Remplacement', ball: true },
    { key: 'card',    label: 'Carton central' },
    { key: 'ticker',  label: 'Bandeau défilant' },
    { key: 'ecran',   label: 'Écran plein' },
    { key: 'replay',  label: 'Replay' }
  ];
  // Éléments proposés pour un sport (karting ou sport de balle)
  const elementsFor = key => ELEMENTS.filter(e => (sport(key) || {}).karting ? !e.ball : !e.kart);
  const WIPES = [
    { key: 'volet',  label: 'Volet' },
    { key: 'rideau', label: 'Rideau' },
    { key: 'barres', label: 'Barres' }
  ];
  const SCREENS = [
    { key: 'avant',   label: 'Avant-match', title: 'Avant-match' },
    { key: 'pause',   label: 'Pause',       title: 'Mi-temps' },
    { key: 'fin',     label: 'Fin',         title: 'Fin du match' },
    { key: 'coupure', label: 'Coupure',     title: 'Nous revenons dans un instant' }
  ];

  // Karting (data/karting.json) : valeurs par défaut
  function kartDefaults() {
    return {
      url: '', host: 'live-data.apex-timing.com', port: 0, title: '', tracks: [],
      track: { id: '', title: '', viewbox: '', paths: { track: '', s1: '', s2: '', s3: '', in: '', out: '' }, times: {} },
      names: {}, tower: { rows: 10, mode: 'gap', best: true, names: 'code' }, focus: '', duel: ['', ''],
      demo: { on: false, start: 0, seed: 1, karts: 12, mode: 'sprint', laps: 15 }
    };
  }
  function fixKart(K) {
    const d = kartDefaults();
    K = Object.assign(d, K || {});
    K.tower = Object.assign(kartDefaults().tower, K.tower);
    K.demo = Object.assign(kartDefaults().demo, K.demo);
    K.track = Object.assign(kartDefaults().track, K.track);
    if (!K.names || Array.isArray(K.names)) K.names = {};
    if (!Array.isArray(K.duel)) K.duel = ['', ''];
    return K;
  }

  // Infos : valeurs par défaut des blocs ajoutés après coup (écran plein, replay)
  function fixInfos(I) {
    if (!I) return I;
    I.ecran = Object.assign({ type: 'avant', title: '', text: '', time: '' }, I.ecran);
    I.replay = Object.assign({ label: '', auto: false, sec: 8 }, I.replay);
    return I;
  }
  const allOff = () => Object.fromEntries(ELEMENTS.map(e => [e.key, false]));

  function sceneDefaults() {
    const program = { ...allOff(), score: true };
    return {
      studio: true, transition: 'anim', take: 0,           // le mode studio est le mode principal
      program, preview: { ...program },
      auto: { lower: true, sub: true },
      wipe: { id: 0, style: 'volet', scene: '' }, wipeStyle: 'volet', wipeObs: true, scenes: [],
      snap: { equipes: null, infos: null, graphiques: null }
    };
  }

  function fixScene(A) {
    A = Object.assign(sceneDefaults(), A);
    A.program = Object.assign(allOff(), A.program);
    A.preview = Object.assign(allOff(), A.preview);
    A.snap = Object.assign({ equipes: null, infos: null, graphiques: null }, A.snap);
    A.auto = Object.assign({ lower: true, sub: true }, A.auto);
    A.wipe = Object.assign({ id: 0, style: 'volet', scene: '' }, A.wipe);
    if (A.snap.infos) A.snap.infos = fixInfos(A.snap.infos);
    return A;
  }

  // Affiche / masque un élément : à l'aperçu en mode studio, directement au programme sinon
  function setShown(A, key, v) {
    const t = A.studio ? A.preview : A.program;
    t[key] = v;
    if (v && key === 'lower') t.sub = false;          // même emplacement à l'écran : un seul des deux
    if (v && key === 'sub') t.lower = false;
    if (!A.studio) A.preview = { ...A.program };
  }

  // Overlays : vue affichée (?vue=apercu pour l'aperçu, programme par défaut)
  const VUE = params.get('vue') === 'apercu' ? 'preview' : 'program';

  // Contenu à afficher : en mode studio, le programme montre la version prise à l'antenne
  const sceneContent = (A, key, live) => (VUE === 'program' && A && A.studio && A.snap[key]) || live;

  // Overlays : suit l'antenne. Une transition « coupe » s'applique sans animation.
  function watchScene(cb) {
    let lastTake = null;
    watch('antenne', raw => {
      const A = fixScene(raw);
      const cut = VUE === 'program' && lastTake !== null && A.take !== lastTake && A.transition === 'cut';
      lastTake = A.take;
      if (cut) document.documentElement.classList.add('cut');
      cb(A);
      // retiré une fois toutes les entrées terminées, pour ne relancer aucune animation
      if (cut) setTimeout(() => document.documentElement.classList.remove('cut'), 2500);
    }, 300);
  }

  // Régie : store de l'antenne, avec masquage automatique du bandeau nom et du remplacement
  function scene(onChange, onStatus = () => {}) {
    let before = null, autoMs = 8000;
    const timers = {};
    watch('habillage', H => { autoMs = fixLook(H).options.autoHideSec * 1000; }, 5000);
    const st = store({
      f: 'antenne', defaults: sceneDefaults, normalize: fixScene, onStatus,
      onChange: A => {
        for (const key of ['lower', 'sub']) {
          const on = A.program[key], was = before && before.program[key];
          if (on && !was && A.auto[key]) {
            clearTimeout(timers[key]);
            timers[key] = setTimeout(() => st.update(A => {
              A.program[key] = false;
              if (!A.studio) A.preview[key] = false;
            }), autoMs);
          }
          if (!on) clearTimeout(timers[key]);
        }
        before = clone(A);
        onChange(A);
      }
    });
    return {
      get: st.get,
      update: st.update,
      toggle: key => st.update(A => setShown(A, key, !(A.studio ? A.preview : A.program)[key])),
      hide: keys => st.update(A => { for (const k of keys) A.program[k] = A.preview[k] = false; })
    };
  }

  // Bouton « antenne » d'un élément : rouge = au programme, vert = à l'aperçu (mode studio)
  function tally(btn, A, key) {
    const live = A.program[key], prev = A.studio && A.preview[key];
    btn.classList.toggle('red', live);
    btn.classList.toggle('green', !live && prev);
    btn.textContent = live ? 'À l’antenne' : prev ? 'En aperçu' : 'Hors antenne';
    btn.title = A.studio
      ? 'Mode studio : prépare l’élément à l’aperçu, puis « Prendre » dans l’onglet Studio'
      : 'Afficher / masquer à l’antenne';
  }

  // ---------- Petits outils d'animation (overlays) ----------
  // Relance une animation CSS : retire la classe, force le recalcul, la remet
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  // Texte découpé en lettres, chacune numérotée (--i) pour un départ décalé
  function letters(el, text) {
    if (el.dataset.text === text) return;
    el.dataset.text = text;
    el.replaceChildren(...[...text].map((ch, i) => {
      const s = document.createElement('span');
      s.textContent = ch === ' ' ? '\u00a0' : ch;
      s.style.setProperty('--i', i);
      return s;
    }));
  }

  // Compte de 0 jusqu'à la valeur (ex. score du carton de mi-temps)
  function countUp(el, to, ms = 900) {
    const t0 = performance.now();
    (function step(t) {
      const k = Math.min(1, (t - t0) / ms);
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }

  // État d'un nouveau match. Sert aussi aux overlays tant qu'aucun match n'a été enregistré.
  function newScore(key = Object.keys(SPORTS)[0], old = null) {
    const team = (side, name, color) => ({
      name: old ? old[side].name : name,
      code: old ? old[side].code : '',
      color: old ? old[side].color : color,
      logo: old ? old[side].logo : '',
      score: 0, sets: 0, fouls: 0, cards: 0
    });
    const shot = sport(key).shot;
    return {
      sport: key,
      home: team('home', 'DOMICILE', '#e63946'),
      away: team('away', 'EXTÉRIEUR', '#1d6fe0'),
      period: 0,
      clock: { running: false, baseMs: periodStart(key, 0), startedAt: 0 },
      shot: { baseMs: shot ? shot[0] * 1000 : 0, startedAt: 0 },
      history: [],          // scores des sets joués (volley)
      scorers: [],          // marqueurs : { team, player, minute, label }
      sinbins: [],          // exclusions temporaires en cours
      compact: old ? old.compact : false,
      status: '',           // 'ht', 'ft', 'pause' : affiché à la place du chrono
      added: 0,
      serve: '',
      // l'identifiant continue d'augmenter : l'overlay ne rejoue jamais un ancien bandeau
      event: { id: old ? old.event.id : 0, team: '', label: '', player: '', minute: '' }
    };
  }

  // Score enregistré par une version plus ancienne : on complète les champs manquants
  function fixScore(S) {
    const d = { history: [], scorers: [], sinbins: [], compact: false, status: '', added: 0, serve: '', shot: { baseMs: 0, startedAt: 0 } };
    for (const k in d) if (S[k] === undefined) S[k] = clone(d[k]);
    for (const side of ['home', 'away']) {
      S[side] = Object.assign({ code: '', logo: '', sets: 0, fouls: 0, cards: 0 }, S[side]);
    }
    S.event = Object.assign({ id: 0, team: '', label: '', player: '', minute: '' }, S.event);
    return S;
  }

  // Texte noir ou blanc selon la luminosité de la couleur de fond
  function textColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? '#111' : '#fff';
  }

  function setText(el, text) {
    if (typeof el === 'string') el = $(el);
    if (el.textContent !== String(text)) el.textContent = text;
  }

  // ---------- Lecture des données ----------
  // Lit la réponse JSON du serveur, avec un message clair si PHP n'est pas exécuté
  // (le serveur renvoie alors le code source du fichier .php au lieu de son résultat).
  async function json(r) {
    const text = await r.text();
    if (text.trimStart().startsWith('<?php')) throw new Error("PHP n'est pas exécuté par ce serveur (voir README)");
    try { return JSON.parse(text); } catch (e) { throw new Error('réponse invalide du serveur (code ' + r.status + ')'); }
  }

  // Mise à jour du site : si la version du code change, la page se recharge d'elle-même
  // (la régie attend d'avoir tout envoyé ; voir canReload).
  let version = null;
  const idle = [];                                  // une fonction par store : « tout est envoyé ? »
  const canReload = () => idle.every(fn => fn());
  function checkVersion(v) {
    if (!v) return;
    if (version === null) version = v;
    else if (v !== version && canReload()) location.reload();
  }

  async function read(f) {
    const t0 = Date.now();
    const r = await fetch(`../api/lire.php?f=${f}&_=${t0}`, { cache: 'no-store' });
    const t1 = Date.now();
    const j = await json(r);
    if (!r.ok) throw new Error(j.error || 'code ' + r.status);
    sample(j.serverTime, t0, t1);
    checkVersion(j.version);
    return j;
  }

  // Overlays (et studio) : appelle cb(state) à chaque changement des données.
  // state vaut null tant que rien n'a été enregistré.
  function watch(f, cb, ms = 400) {
    let rev = -1;
    (async function loop() {
      try {
        const j = await read(f);
        if (j.rev !== rev) { rev = j.rev; cb(j.state); }   // state = null : rien d'enregistré pour l'instant
      } catch (e) { /* coupure : on garde l'affichage actuel et on réessaie */ }
      setTimeout(loop, ms);
    })();
  }

  // ---------- Régie : données partagées entre plusieurs pages de contrôle ----------
  // Chaque action est une fonction qui modifie l'état (ex. S => S.home.score++).
  // Elle est appliquée tout de suite à l'écran, puis envoyée au serveur.
  // Si une autre page de contrôle a modifié les données entre-temps (réponse 409),
  // on repart de la version du serveur et on rejoue dessus les actions pas encore enregistrées :
  // rien n'est écrasé, et deux personnes peuvent piloter le même match.
  function store({ f, defaults, onChange, onStatus, normalize = s => s, pollMs = 1000 }) {
    let base = null;      // dernière version confirmée par le serveur
    let rev = 0;          // son numéro de version
    let pending = [];     // actions pas encore enregistrées
    let local = null;     // ce qui est affiché = base + actions en attente
    let ready = false, sending = false;
    idle.push(() => !sending && !pending.length);

    function rebuild() {
      local = clone(base);
      for (const fn of pending) fn(local);
      onChange(local);
    }

    function update(fn) {
      if (!ready) return;
      pending.push(fn);
      fn(local);
      onChange(local);
      flush();
    }

    async function flush() {
      if (sending) return;
      sending = true;
      while (pending.length) {
        const n = pending.length;
        onStatus('sending');
        try {
          const t0 = Date.now();
          const r = await fetch('ecrire.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ f, rev, state: local, version }),
            cache: 'no-store'
          });
          const t1 = Date.now();
          if (r.status === 401) throw new Error('identification refusée');
          const j = await json(r);
          if (j.version && j.version !== version) { location.reload(); return; }   // site mis à jour
          if (r.status === 409) {               // conflit : on rejoue sur la version du serveur
            rev = j.rev;
            base = j.state ? normalize(j.state) : defaults();
            rebuild();
            continue;
          }
          if (!r.ok) throw new Error(j.error || 'code ' + r.status);
          sample(j.serverTime, t0, t1);
          rev = j.rev;
          base = normalize(j.state);
          pending = pending.slice(n);
          rebuild();
          onStatus('ok');
        } catch (e) {
          onStatus('error', e.message);
          await sleep(2000);
        }
      }
      sending = false;
    }

    // Récupère les changements faits depuis une autre page de contrôle
    async function poll() {
      try {
        if (!sending && !pending.length) {
          const j = await read(f);
          if (j.rev > rev && !sending && !pending.length) {
            rev = j.rev;
            base = j.state ? normalize(j.state) : defaults();
            rebuild();
          }
          onStatus('ok');
        }
      } catch (e) {
        onStatus('error', e.message);
      }
      setTimeout(poll, pollMs);
    }

    async function init() {
      onStatus('connecting');
      try {
        const j = await read(f);
        rev = j.rev;
        base = j.state ? normalize(j.state) : defaults();
        ready = true;
        rebuild();
        onStatus('ok');
        if (!j.state) update(() => {});              // premier lancement : on crée le fichier
        setTimeout(poll, pollMs);
      } catch (e) {
        onStatus('error', e.message);
        setTimeout(init, 3000);
      }
    }

    init();
    return { update, get: () => local };
  }

  // Voyant de synchronisation (en haut à droite de la régie)
  function syncStatus(kind, msg) {
    const texts = {
      connecting: 'Connexion…',
      sending: 'Envoi…',
      ok: 'Synchronisé',
      error: 'Erreur : ' + (msg || 'serveur injoignable')
    };
    const el = $('sync');
    if (!el) return;
    el.dataset.kind = kind;
    el.querySelector('span').textContent = texts[kind];
    el.title = kind === 'error' ? 'Nouvelle tentative automatique…' : '';
  }

  // Moniteurs de la régie : l'overlay (1920 × 1080) réduit à la largeur de son cadre
  function monitor(frame) {
    const box = frame.parentElement;
    const fit = () => {
      const k = box.clientWidth / 1920;
      frame.style.transform = `scale(${k})`;
      box.style.height = Math.round(1080 * k) + 'px';
    };
    new ResizeObserver(fit).observe(box);
    fit();
  }

  // Overlays : réglages par l'adresse, ex. ?taille=1.2&accent=ff5500
  function applyLook() {
    const root = document.documentElement.style;
    const s = parseFloat(params.get('taille'));
    if (s >= 0.4 && s <= 3) root.setProperty('--s', s);
    const a = params.get('accent') || '';
    if (/^[0-9a-f]{6}$/i.test(a)) {
      root.setProperty('--accent', '#' + a);
      root.setProperty('--on-accent', textColor('#' + a));   // texte lisible sur l'accent
    }
  }

  // Vrai si l'utilisateur est en train d'écrire (pour ne pas déclencher les raccourcis clavier)
  const typing = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;

  // ---------- Régie : sous-onglets et accordéons ----------
  // Sous-onglets : <nav class="subtabs" data-subtabs="cle"><button data-sub="a">…</button></nav>
  // et des blocs <div data-subpane="a">. L'onglet choisi est retenu ; l'adresse #a l'ouvre directement.
  function subtabs(nav, onChange) {
    const key = 'sub.' + nav.dataset.subtabs;
    const ids = [...nav.querySelectorAll('[data-sub]')].map(b => b.dataset.sub);
    const scope = nav.closest('[data-subscope]') || document;
    function show(id, save = true) {
      if (!ids.includes(id)) id = ids[0];
      nav.querySelectorAll('[data-sub]').forEach(b => {
        b.classList.toggle('sel', b.dataset.sub === id);
        b.setAttribute('aria-selected', b.dataset.sub === id);
      });
      scope.querySelectorAll('[data-subpane]').forEach(p => {
        if (ids.includes(p.dataset.subpane)) p.hidden = p.dataset.subpane !== id;
      });
      if (save) try { localStorage.setItem(key, id); } catch (e) { /* stockage indisponible */ }
      if (onChange) onChange(id);
    }
    nav.setAttribute('role', 'tablist');
    nav.addEventListener('click', e => { const b = e.target.closest('[data-sub]'); if (b) show(b.dataset.sub); });
    let first = location.hash.slice(1);
    if (!ids.includes(first)) try { first = localStorage.getItem(key); } catch (e) { first = null; }
    show(first, false);
    addEventListener('hashchange', () => { const h = location.hash.slice(1); if (ids.includes(h)) show(h); });
    return { show };
  }

  // Accordéons <details data-acc="cle"> : ouverts / fermés comme la dernière fois
  function accordions(root = document) {
    for (const d of root.querySelectorAll('details[data-acc]')) {
      const key = 'acc.' + d.dataset.acc;
      try { const v = localStorage.getItem(key); if (v !== null) d.open = v === '1'; } catch (e) { /* stockage indisponible */ }
      d.addEventListener('toggle', () => { try { localStorage.setItem(key, d.open ? '1' : '0'); } catch (e) { /* idem */ } });
    }
  }

  // Texte sûr à insérer dans du HTML
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  return {
    subtabs, accordions, esc,
    $, sleep, clone, params, now,
    loadSports, sports: () => SPORTS, sport, period, hasClock, periodStart, periodEnd, clockMs, shotMs, fmt, volley,
    minute, sinbinLeft, code, teamLabel, shortName, playerName, logoUrl, fixScore, newScore,
    uid, findClub, fullName, playerLabel, newLineups, lineup, identityOf, syncIdentity, parsePlayer, upload, migrateLineups,
    ELEMENTS, elementsFor, kartDefaults, fixKart, WIPES, SCREENS, fixInfos, sceneDefaults, fixScene, setShown, VUE, sceneContent, watchScene, scene, tally,
    FONTS, PLACEABLE, lookDefaults, fixLook, setLook, watchLook, look: () => LOOK, EDIT, onEdit, editVisible,
    replay, letters, countUp,
    textColor, setText, read, watch, store, syncStatus, monitor, applyLook, typing,
    get offset() { return offset; }
  };
})();
