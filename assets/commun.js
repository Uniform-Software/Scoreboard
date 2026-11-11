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
  async function read(f) {
    const t0 = Date.now();
    const r = await fetch(`../api/lire.php?f=${f}&_=${t0}`, { cache: 'no-store' });
    const t1 = Date.now();
    if (!r.ok) throw new Error('code ' + r.status);
    const j = await r.json();
    sample(j.serverTime, t0, t1);
    return j;
  }

  // Overlays : appelle cb(state) à chaque changement des données.
  // Avec ?preview (aperçu dans la régie), les données arrivent directement de la page parente :
  // l'aperçu réagit instantanément, sans attendre le serveur.
  function watch(f, cb, ms = 400) {
    if (params.has('preview')) {
      window.addEventListener('message', e => {
        if (e.origin !== location.origin || !e.data || e.data.f !== f) return;
        offset = e.data.offset;
        synced = true;
        cb(e.data.state);
      });
      parent.postMessage({ ready: f }, location.origin);
      return;
    }
    let rev = -1;
    (async function loop() {
      try {
        const j = await read(f);
        if (j.rev !== rev && j.state) { rev = j.rev; cb(j.state); }
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
  function store({ f, defaults, onChange, onStatus, pollMs = 1000 }) {
    let base = null;      // dernière version confirmée par le serveur
    let rev = 0;          // son numéro de version
    let pending = [];     // actions pas encore enregistrées
    let local = null;     // ce qui est affiché = base + actions en attente
    let ready = false, sending = false;

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
            body: JSON.stringify({ f, rev, state: local }),
            cache: 'no-store'
          });
          const t1 = Date.now();
          if (r.status === 401) throw new Error('identification refusée');
          const j = await r.json().catch(() => null);
          if (r.status === 409 && j) {               // conflit : on rejoue sur la version du serveur
            rev = j.rev;
            base = j.state || defaults();
            rebuild();
            continue;
          }
          if (!r.ok || !j) throw new Error((j && j.error) || 'code ' + r.status);
          sample(j.serverTime, t0, t1);
          rev = j.rev;
          base = j.state;
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
            base = j.state || defaults();
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
        base = j.state || defaults();
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

  // Aperçu dans la régie : l'overlay lui-même dans une iframe, réduit à la largeur disponible.
  // Renvoie une fonction à appeler avec le nouvel état à chaque changement.
  function preview(frame, f) {
    let last = null;
    const send = () => {
      if (last && frame.contentWindow) frame.contentWindow.postMessage({ f, state: last, offset }, location.origin);
    };
    window.addEventListener('message', e => {
      if (e.origin === location.origin && e.data && e.data.ready === f) send();
    });
    const box = frame.parentElement;
    const fit = () => {
      const k = box.clientWidth / 1920;
      frame.style.transform = `scale(${k})`;
      box.style.height = Math.round(1080 * k) + 'px';
    };
    new ResizeObserver(fit).observe(box);
    fit();
    return state => { last = state; send(); };
  }

  // Overlays : réglages par l'adresse, ex. ?taille=1.2&accent=ff5500
  function applyLook() {
    const root = document.documentElement.style;
    const s = parseFloat(params.get('taille'));
    if (s >= 0.4 && s <= 3) root.setProperty('--s', s);
    const a = params.get('accent') || '';
    if (/^[0-9a-f]{6}$/i.test(a)) root.setProperty('--accent', '#' + a);
  }

  // Vrai si l'utilisateur est en train d'écrire (pour ne pas déclencher les raccourcis clavier)
  const typing = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;

  return {
    $, sleep, clone, params, now,
    loadSports, sport, period, hasClock, periodStart, periodEnd, clockMs, fmt, volley,
    textColor, setText, read, watch, store, syncStatus, preview, applyLook, typing,
    get offset() { return offset; }
  };
})();
