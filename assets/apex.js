// apex.js : live timing Apex Timing (karting).
// Se connecte directement au flux du circuit (WebSocket), lit les messages « clé|classe|valeur »
// et tient à jour un modèle : session (titre, temps restant, drapeau) et pilotes (position, numéro,
// nom, dernier / meilleur tour, écart, tours, stands…). Signale aussi les évènements (meilleur tour,
// drapeau, dépassement, passage de ligne).
// Le mode démo simule une course avec les mêmes messages : tous les écrans voient la même course
// (graine et heure de départ communes, heure du serveur).
//
//   const f = Apex.feed(K);          K = data/karting.json
//   f.on('change', () => …)          f.on('event', ev => …)        f.on('status', ok => …)
//   f.session(), f.drivers(), f.driver(no), f.close()
'use strict';

const Apex = (() => {
  // Colonnes Apex (data-type) -> nom lisible dans le modèle
  const COLS = { rk: 'rank', no: 'no', dr: 'name', llp: 'last', blp: 'best', gap: 'gap', int: 'int', tlp: 'laps',
    otr: 'otr', pit: 'pits', s1: 's1', s2: 's2', s3: 's3', sta: 'sta', grp: 'grp', nat: 'nat', tea: 'team' };
  const FLAGS = { lg: 'green', ly: 'yellow', lr: 'red', lf: 'finish', lc: 'finish', lo: '', ls: 'red' };

  // Texte d'une valeur qui peut contenir du HTML
  const parser = typeof DOMParser !== 'undefined' ? new DOMParser() : null;
  function plain(v) {
    if (!/[<&]/.test(v)) return v.trim();
    return parser ? (parser.parseFromString('<body>' + v, 'text/html').body.textContent || '').trim() : v.replace(/<[^>]*>/g, '').trim();
  }
  // « 1:02.345 » ou « 62.345 » -> 62345 ms (NaN si ce n'est pas un temps)
  function ms(t) {
    const m = String(t || '').trim().match(/^(?:(\d+):)?(\d{1,2})[.,](\d{1,3})$/);
    if (!m) return NaN;
    return (+(m[1] || 0) * 60 + +m[2]) * 1000 + +m[3].padEnd(3, '0');
  }
  const fmtLap = v => {
    if (!Number.isFinite(v)) return '';
    const m = Math.floor(v / 60000), s = (v % 60000) / 1000;
    return m ? `${m}:${s.toFixed(3).padStart(6, '0')}` : s.toFixed(3);
  };

  /* ====================================================================
     Flux : modèle + analyse des messages
     ==================================================================== */
  function feed(K, opts = {}) {
    const handlers = { change: [], event: [], status: [] };
    const emit = (k, v) => handlers[k].forEach(fn => { try { fn(v); } catch (e) { console.error(e); } });
    const M = { type: 'n', title1: '', title2: '', track: '', light: '', flag: '', dyn1: null, dyn2: null, com: '', msg: '',
      cols: {}, rows: {}, css: {}, connected: false, demo: !!(K.demo && K.demo.on) };
    let silent = false, pending = false;

    function changed() {
      if (pending) return;
      pending = true;
      (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : setTimeout)(() => { pending = false; emit('change', M); });
    }
    const event = ev => { if (!silent) emit('event', ev); };

    function setGrid(html) {
      M.rows = {};
      M.cols = {};
      if (!parser) return;
      const doc = parser.parseFromString('<table>' + html + '</table>', 'text/html');
      for (const tr of doc.querySelectorAll('tr[data-id]')) {
        const id = tr.getAttribute('data-id');
        if (id === 'r0' || tr.classList.contains('head')) {
          for (const td of tr.querySelectorAll('td[data-id]')) M.cols[td.getAttribute('data-id')] = td.getAttribute('data-type') || '';
          continue;
        }
        const row = M.rows[id] = { id, pos: +tr.getAttribute('data-pos') || 0, cells: {}, lap: null, sector: null, pit: null };
        for (const el of tr.querySelectorAll('[data-id]')) {
          const m = el.getAttribute('data-id').match(/^r\d+(c\d+)$/);
          if (!m) continue;
          const type = M.cols[m[1]];
          if (type) row.cells[type] = { text: (el.textContent || '').trim(), cls: el.getAttribute('class') || '' };
        }
      }
    }

    function setCell(rowId, col, cls, val, at) {
      const row = M.rows[rowId];
      const type = M.cols[col];
      if (!row || !type) return;
      const before = row.cells[type] || { text: '', cls: '' };
      const cell = row.cells[type] = { text: plain(val), cls };
      // meilleur tour de la session (classe « tb ») sur le dernier tour
      if (type === 'llp' && cls === 'tb' && cell.text && (before.cls !== 'tb' || before.text !== cell.text)) {
        event({ type: 'best', id: rowId, time: cell.text, at });
      }
    }

    function line(parts, at) {
      const [key, cls, val] = parts;
      if (key === 'init') {
        M.type = cls || 'n';
        M.rows = {}; M.cols = {}; M.dyn1 = M.dyn2 = null; M.light = M.flag = '';
        return;
      }
      if (key === 'grid') return setGrid(val);
      if (key === 'css') {
        const bg = (val.match(/border-bottom-color:\s*(#[0-9a-f]{6})/i) || [])[1];
        const fg = (val.match(/(?:^|;)\s*color:\s*(#[0-9a-f]{6})/i) || [])[1];
        if (bg) M.css[cls] = { bg, fg: fg || '#ffffff' };
        return;
      }
      if (key === 'dyn1' || key === 'dyn2') { M[key] = { cls, value: val, at }; return; }
      if (key === 'light') {
        const flag = FLAGS[cls] ?? '';
        if (flag !== M.flag) event({ type: 'flag', flag, at });
        M.light = cls; M.flag = flag;
        return;
      }
      if (['title1', 'title2', 'track', 'com', 'msg'].includes(key)) { M[key] = key === 'com' ? val : plain(val); return; }
      const cell = key.match(/^(r\d+)(c\d+)$/);
      if (cell) return setCell(cell[1], cell[2], cls, val, at);
      const row = /^r\d+$/.test(key) ? M.rows[key] : null;
      if (!row) return;
      if (cls === '#') {
        const pos = +val;
        if (row.pos && pos && pos < row.pos) event({ type: 'gain', id: key, from: row.pos, to: pos, at });
        row.pos = pos;
      } else if (cls === '*') {
        const d = String(val).includes('.') ? parseFloat(val) * 1000 : parseInt(val, 10);
        row.lap = { at, ms: d > 0 ? d : 0 };
        row.sector = null;
        if (row.pit && row.pit.k === 'out') row.pit = null;
        event({ type: 'line', id: key, at });
      } else if (cls === '*i1' || cls === '*i2') {
        row.sector = { k: cls === '*i1' ? 1 : 2, at };
      } else if (cls === '*in') {
        row.pit = { k: 'in', at };
        event({ type: 'pitin', id: key, at });
      } else if (cls === '*out') {
        row.pit = { k: 'out', at, ms: parseInt(val, 10) || 0 };
        event({ type: 'pitout', id: key, at });
      }
    }

    // Un message = plusieurs lignes ; at = heure locale de l'évènement (ms)
    function receive(text, at = Date.now()) {
      for (const l of String(text).split('\n')) {
        if (!l) continue;
        const p = l.split('|');
        while (p.length < 3) p.push('');
        line([p[0], p[1], p.slice(2).join('|')], at);
      }
      changed();
    }

    /* ---------- Lecture du modèle ---------- */
    let names = (K && K.names) || {};
    const cell = (r, t) => r.cells[t] || { text: '', cls: '' };
    function driver(r) {
      const no = cell(r, 'no').text;
      const nm = names[no] || {};
      const raw = cell(r, 'dr').text;
      // endurance : « ÉQUIPE [PILOTE] » ou « ÉQUIPE - PILOTE » selon les circuits
      const m = raw.match(/^(.*?)\s*[[(](.+)[\])]\s*$/);
      const colors = M.css[cell(r, 'no').cls] || null;
      return {
        id: r.id, pos: r.pos, no,
        name: nm.name || (m ? m[2] : raw), team: nm.team || cell(r, 'tea').text || (m ? m[1] : ''),
        apexName: raw, color: colors ? colors.bg : '', colorText: colors ? colors.fg : '',
        last: cell(r, 'llp').text, lastCls: cell(r, 'llp').cls, best: cell(r, 'blp').text, bestCls: cell(r, 'blp').cls,
        gap: cell(r, 'gap').text, int: cell(r, 'int').text, laps: cell(r, 'tlp').text, pits: cell(r, 'pit').text,
        otr: cell(r, 'otr').text, sta: cell(r, 'sta').cls, s1: cell(r, 's1').text, s2: cell(r, 's2').text, s3: cell(r, 's3').text,
        lap: r.lap, sector: r.sector, pit: r.pit,
        inPit: !!(r.pit && r.pit.k === 'in') || cell(r, 'sta').cls === 'si'
      };
    }
    const drivers = () => Object.values(M.rows).filter(r => r.pos > 0).sort((a, b) => a.pos - b.pos).map(driver);

    function session(now = Date.now()) {
      const dyn = d => {
        if (!d) return { kind: '', text: '', ms: 0 };
        let v = String(d.value || ''), suffix = '';
        if (d.cls === 'countdown_text' && v.includes('_')) [v, suffix] = v.split('_');
        const base = v.includes('.') ? parseFloat(v) * 1000 : parseInt(v, 10);
        if (d.cls === 'countdown' || d.cls === 'countdown_text') {
          const left = Math.max(0, base - (now - d.at));
          return { kind: 'countdown', ms: left, text: (clock(left) + ' ' + suffix).trim() };
        }
        if (d.cls === 'count') { const el = base + (now - d.at); return { kind: 'count', ms: el, text: clock(el) }; }
        return { kind: 'text', ms: 0, text: plain(v) };
      };
      // meilleur tour de la session : le plus petit « meilleur tour »
      let best = null;
      for (const r of Object.values(M.rows)) {
        const t = ms(cell(r, 'blp').text);
        if (Number.isFinite(t) && (!best || t < best.ms)) best = { ms: t, text: cell(r, 'blp').text, id: r.id };
      }
      return {
        live: M.type !== 'n', race: M.type === 'r', type: M.type, connected: M.connected, demo: M.demo,
        title: [M.title1, M.title2].filter(Boolean).join(' · '), title1: M.title1, title2: M.title2, track: M.track,
        flag: M.flag, dyn1: dyn(M.dyn1), dyn2: dyn(M.dyn2), best: best && { ...best, driver: driver(M.rows[best.id]) },
        msg: M.msg, columns: Object.values(M.cols)
      };
    }

    /* ---------- Sources : direct ou démo ---------- */
    let ws = null, retry = 1000, timer = null, closed = false, sim = null;
    function connect() {
      if (closed || !K.port) return;
      try { ws = new WebSocket(`wss://${K.host || 'live-data.apex-timing.com'}:${K.port + 3}/`); } catch (e) { return later(); }
      ws.onopen = () => { retry = 1000; M.connected = true; emit('status', true); changed(); };
      ws.onmessage = e => receive(e.data);
      ws.onclose = () => { M.connected = false; emit('status', false); changed(); later(); };
      ws.onerror = () => {};
    }
    function later() {
      if (closed) return;
      clearTimeout(timer);
      timer = setTimeout(connect, retry);
      retry = Math.min(30000, retry * 2);
    }

    if (M.demo) {
      sim = simulate(K.demo);
      M.connected = true;
      const off = () => (typeof SB !== 'undefined' ? SB.offset : 0);
      // rattrapage silencieux jusqu'à maintenant, puis lecture en direct
      silent = true;
      for (const b of sim.until(Date.now() + off())) receive(b.text, b.t - off());
      silent = false;
      timer = setInterval(() => { for (const b of sim.until(Date.now() + off())) receive(b.text, b.t - off()); }, 100);
    } else connect();

    return {
      on: (k, fn) => { handlers[k].push(fn); if (k === 'change') fn(M); },
      receive, session, drivers,
      setNames: n => { names = n || {}; changed(); },
      driver: no => drivers().find(d => d.no === String(no)) || null,
      model: () => M,
      close() { closed = true; clearTimeout(timer); clearInterval(timer); if (ws) { ws.onclose = null; ws.close(); } }
    };
  }

  // 754000 -> « 12:34 », 3754000 -> « 1:02:34 »
  function clock(v) {
    const s = Math.floor(v / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(sec).padStart(2, '0');
  }

  /* ====================================================================
     Démo : course simulée, identique sur tous les écrans
     ==================================================================== */
  const FIRST = ['Léo', 'Hugo', 'Emma', 'Nathan', 'Lina', 'Jules', 'Chloé', 'Noah', 'Inès', 'Louis', 'Jade', 'Gabin', 'Zoé', 'Malo', 'Léa', 'Tom', 'Rose', 'Sacha', 'Alice', 'Enzo', 'Manon', 'Arthur', 'Nina', 'Paul'];
  const LAST = ['Martin', 'Bernard', 'Dubois', 'Durand', 'Lefèvre', 'Moreau', 'Laurent', 'Simon', 'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Morel', 'Girard', 'André', 'Mercier', 'Blanc', 'Guérin', 'Boyer', 'Garnier', 'Chevalier'];
  const TEAMS = ['Kart Attack', 'Les Rapides', 'Team Apex', 'Turbo Club', 'Racing 64', 'Pau Motors', 'Les Pistards', 'Écurie du Sud', 'Full Gaz', 'Chrono Team', 'Les Virages', 'Box Box', 'Grip Masters', 'Team Béarn', 'Slicks', 'Rookies', 'Drift King', 'Les Pilotes', 'Podium', 'Pole Club', 'Vitesse 31', 'Team Kart', 'Les Fusées', 'Sprint Co'];
  const KCOLORS = ['#e63946', '#1d6fe0', '#ffd400', '#12b76a', '#ff7a00', '#8b5cf6', '#ffffff', '#00b8d9', '#ff4fa3', '#111111'];

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  function simulate(D) {
    const R = rng(D.seed || 1);
    const n = D.karts || 12, mode = D.mode || 'sprint';
    const race = mode !== 'loisir';
    const start = D.start || 0;
    const duration = mode === 'loisir' ? 8 * 60000 : mode === 'endurance' ? 20 * 60000 : 0;
    const totalLaps = D.laps || 15;
    const BASE = 52000, PIT = 24000;

    // Pilotes, numéros, niveau ; puis tous les tours à l'avance
    const nos = Array.from({ length: n }, (_, i) => i + 1 + Math.floor(R() * 3) * 10).map((v, i, a) => a.indexOf(v) === i ? v : 60 + i);
    const karts = nos.map((no, i) => {
      const skill = R() * 2600, name = mode === 'endurance' ? `${TEAMS[i % TEAMS.length]} [${FIRST[(i * 7) % FIRST.length]} ${LAST[i % LAST.length]}]`
        : mode === 'loisir' ? 'KART ' + no : `${FIRST[(i * 5 + 3) % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`;
      const laps = [];
      let t = start + (race ? i * 180 : R() * 20000);          // départ en file (course) ou étalé (loisir)
      const pitEvery = 6 + Math.floor(R() * 4);
      for (let k = 1; k < 400; k++) {
        let d = BASE + skill + (R() - 0.4) * 1500 + (k === 1 && race ? 2500 : 0) + (R() < 0.04 ? 3000 + R() * 4000 : 0);
        const pit = mode === 'endurance' && k % pitEvery === 0;
        if (pit) d += PIT;
        laps.push({ k, start: t, end: t + d, ms: Math.round(d), pit });
        t += d;
      }
      return { id: 'r' + (i + 1), no: String(no), name, laps, color: KCOLORS[i % KCOLORS.length] };
    });

    // Fin : course = le premier boucle le nombre de tours ; temps = au bout de la durée
    const leaderEnd = race && mode === 'sprint' ? Math.min(...karts.map(k => k.laps[totalLaps - 1].end)) : start + duration;

    // Évènements datés (passages de ligne et de secteurs, stands)
    const evs = [];
    for (const k of karts) {
      for (const lap of k.laps) {
        if (lap.start > leaderEnd) break;
        const clean = lap.pit ? lap.ms - PIT : lap.ms;
        evs.push({ t: lap.start, kind: 'line', k, lap });
        evs.push({ t: lap.start + clean / 3, kind: 'i1', k, lap });
        evs.push({ t: lap.start + 2 * clean / 3, kind: 'i2', k, lap });
        if (lap.pit) { evs.push({ t: lap.start + clean * 0.92, kind: 'in', k, lap }); evs.push({ t: lap.end - 4000, kind: 'out', k, lap }); }
        evs.push({ t: lap.end, kind: 'end', k, lap });
      }
    }
    evs.sort((a, b) => a.t - b.t);

    const cols = race
      ? ['sta', 'rk', 'no', 'dr', 'llp', 'blp', 'gap', 'int', 'tlp', ...(mode === 'endurance' ? ['pit'] : [])]
      : ['sta', 'rk', 'no', 'dr', 'llp', 'blp', 'gap', 'tlp'];
    const ci = t => 'c' + (cols.indexOf(t) + 1);
    const state = Object.fromEntries(karts.map(k => [k.id, { done: 0, lastEnd: k.laps[0].start, best: Infinity, last: NaN, pits: 0, pos: 0, fin: false }]));
    let sessionBest = Infinity, cursor = 0, started = false, flag = '';
    const out = [];

    function ranking() {
      const list = karts.map(k => ({ k, s: state[k.id] }));
      if (race) list.sort((a, b) => b.s.done - a.s.done || a.s.lastEnd - b.s.lastEnd);
      else list.sort((a, b) => a.s.best - b.s.best);
      return list;
    }
    function gaps(list, lines) {
      const lead = list[0];
      list.forEach((x, i) => {
        let gap = '', int = '';
        if (i > 0) {
          if (race) {
            const lapsDown = lead.s.done - x.s.done;
            gap = lapsDown > 0 ? `${lapsDown} T.` : ((x.s.lastEnd - lead.k.laps[x.s.done - 1 >= 0 ? x.s.done - 1 : 0].end) / 1000).toFixed(3);
            const prev = list[i - 1];
            const d = prev.s.done - x.s.done;
            int = d > 0 ? `${d} T.` : ((x.s.lastEnd - prev.k.laps[Math.max(0, x.s.done - 1)].end) / 1000).toFixed(3);
            if (x.s.done === 0) gap = int = '';
          } else if (Number.isFinite(x.s.best) && Number.isFinite(lead.s.best)) gap = ((x.s.best - lead.s.best) / 1000).toFixed(3);
        }
        lines.push(`${x.k.id}${ci('gap')}|in|${gap}`);
        if (race) lines.push(`${x.k.id}${ci('int')}|in|${int}`);
        if (x.s.pos !== i + 1) {
          x.s.pos = i + 1;
          lines.push(`${x.k.id}|#|${i + 1}`, `${x.k.id}${ci('rk')}||${i + 1}`);
        }
      });
    }
    function grid() {
      const head = cols.map((c, i) => `<td data-id="c${i + 1}" data-type="${c}">${{ rk: 'Clt', no: 'Kart', dr: 'Pilote', llp: 'Dernier T.', blp: 'Meilleur T.', gap: 'Ecart', int: 'Interv.', tlp: 'Tours', pit: 'Stands' }[c] || ''}</td>`).join('');
      const rows = ranking().map((x, i) => {
        x.s.pos = i + 1;
        const tds = cols.map((c, j) => {
          const id = `${x.k.id}c${j + 1}`;
          if (c === 'rk') return `<td class="rk"><div><p data-id="${id}">${i + 1}</p></div></td>`;
          if (c === 'no') return `<td class="no"><div data-id="${id}" class="no${x.k.no}">${x.k.no}</div></td>`;
          if (c === 'dr') return `<td data-id="${id}" class="dr">${x.k.name}</td>`;
          return `<td data-id="${id}" class="${c === 'sta' ? 'sr' : 'in'}"></td>`;
        }).join('');
        return `<tr data-id="${x.k.id}" data-pos="${i + 1}">${tds}</tr>`;
      }).join('');
      return `grid||<tbody><tr data-id="r0" class="head" data-pos="0">${head}</tr>${rows}</tbody>`;
    }

    function header(t) {
      const lines = [`init|${race ? 'r' : 'b'}|`, 'title1||Démo Scoreboard', `title2||${{ sprint: 'Finale', endurance: 'Endurance', loisir: 'Session loisir' }[mode]}`,
        'track||Circuit de démonstration'];
      for (const k of karts) lines.push(`css|no${k.no}|border-bottom-color:${k.color} !important; color:${k.color === '#ffffff' || k.color === '#ffd400' ? '#000000' : '#FFFFFF'} !important;`);
      lines.push(grid());
      lines.push(`light|${t < start ? 'lr' : 'lg'}|`);
      return lines;
    }
    function dyn(t, lines) {
      if (duration) lines.push(`dyn1|countdown|${Math.round(Math.max(0, Math.min(duration, start + duration - t)))}`);
      else {
        const lead = ranking()[0];
        lines.push(`dyn1|text|Tour ${Math.min(totalLaps, lead.s.done + 1)}/${totalLaps}`);
      }
    }

    function until(now) {
      const batches = [];
      if (!started) {
        started = true;
        const t0 = Math.min(now, start);
        const lines = header(t0);
        dyn(t0, lines);
        flag = t0 < start ? 'lr' : 'lg';
        batches.push({ t: t0, text: lines.join('\n') });
      }
      while (cursor < evs.length && evs[cursor].t <= now) {
        const ev = evs[cursor++], s = state[ev.k.id], id = ev.k.id, lines = [];
        if (flag === 'lr' && ev.t >= start) { flag = 'lg'; lines.push('light|lg|'); }
        if (ev.kind === 'line' && !s.fin) lines.push(`${id}|*|${ev.lap.ms}`, `${id}${ci('sta')}|sr|`);
        else if (ev.kind === 'i1') lines.push(`${id}|*i1|`);
        else if (ev.kind === 'i2') lines.push(`${id}|*i2|`);
        else if (ev.kind === 'in') { s.pits++; lines.push(`${id}|*in|`, `${id}${ci('sta')}|si|`); if (cols.includes('pit')) lines.push(`${id}${ci('pit')}|in|${s.pits}`); }
        else if (ev.kind === 'out') lines.push(`${id}|*out|4000`, `${id}${ci('sta')}|so|`);
        else if (ev.kind === 'end' && !s.fin) {
          const lap = ev.lap, d = lap.pit ? NaN : lap.ms;
          s.done = lap.k; s.lastEnd = lap.end;
          let cls = 'tn';
          if (Number.isFinite(d) && d < s.best) { s.best = d; cls = 'ti'; }
          if (Number.isFinite(d) && d < sessionBest) { sessionBest = d; cls = 'tb'; }
          lines.push(`${id}${ci('llp')}|${cls}|${lap.pit ? 'STAND' : fmtLap(d)}`);
          if (cls !== 'tn') lines.push(`${id}${ci('blp')}|${cls === 'tb' ? 'tb' : 'ib'}|${fmtLap(s.best)}`);
          lines.push(`${id}${ci('tlp')}|in|${s.done}`);
          // course finie pour ce kart : premier passage après la fin
          if (lap.end >= leaderEnd) {
            s.fin = true;
            lines.push(`${id}${ci('sta')}|sf|`);
            if (flag !== 'lf') { flag = 'lf'; lines.push('light|lf|'); }
          }
          gaps(ranking(), lines);
          dyn(ev.t, lines);
        }
        if (lines.length) batches.push({ t: ev.t, text: lines.join('\n') });
      }
      return batches;
    }
    return { until, karts };
  }

  /* ====================================================================
     Position estimée sur le tracé (mini map)
     À chaque passage de ligne, Apex donne la durée prévue du tour : le kart avance d'un pas régulier,
     recalé aux passages des secteurs. bounds = fractions du tracé où commencent les secteurs 2 et 3.
     Renvoie une fraction du tour (0 = ligne), ou null si on ne sait pas.
     ==================================================================== */
  function progress(d, now, bounds = [1 / 3, 2 / 3]) {
    if (!d.lap || !d.lap.ms || d.inPit) return null;
    let p = (now - d.lap.at) / d.lap.ms;
    if (d.sector && d.sector.at >= d.lap.at) {
      const b = bounds[d.sector.k - 1];
      if (Number.isFinite(b)) p = Math.max(p, b + (now - d.sector.at) / d.lap.ms);
    }
    if (p < 0) return 0;
    return Math.min(p, 0.995);           // passage suivant pas encore reçu : il attend sur la ligne
  }

  // Tracé de démonstration (vue 0 0 600 380), utilisé quand le circuit n'en publie pas
  const DEMO_TRACK = {
    viewbox: '0 0 600 380',
    paths: { track: 'M 300,330 L 470,330 C 540,330 560,280 540,230 C 520,180 470,190 440,160 C 410,130 450,80 500,70 C 560,60 580,30 540,20 L 120,20 C 60,20 40,60 60,100 C 80,140 160,130 190,170 C 220,210 140,230 90,250 C 40,270 40,330 110,330 Z',
      s1: '', s2: '', s3: '', in: '', out: '' },
    times: { track: 0 }
  };

  return { feed, ms, fmtLap, clock, simulate, progress, DEMO_TRACK };
})();
