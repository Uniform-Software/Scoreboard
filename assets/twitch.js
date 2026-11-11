// twitch.js : connexion anonyme au tchat d'une chaîne Twitch (aucun compte ni clé nécessaire).
// Lit les messages, les abonnements, les abonnements offerts, les raids et les bits, et garde les
// dernières valeurs pour les graphiques ({twitch.abonne}, {twitch.raid}, {twitch.bits}, {twitch.abonnes}).
// Utilisé par overlay/twitch.html (tchat, alertes) et overlay/graphiques.html (variables).
'use strict';

const Twitch = (() => {
  const URL = 'wss://irc-ws.chat.twitch.tv:443';
  let ws = null, channel = '', retry = 1000, timer = null;
  const listeners = [];

  // Dernières valeurs, gardées sur cet ordinateur (elles survivent au rechargement de la source OBS)
  let V = { abonne: '', raid: '', bits: '', abonnes: 0, day: '' };
  const storeKey = () => 'twitch.vars.' + channel;
  function loadVars() {
    try { V = Object.assign({ abonne: '', raid: '', bits: '', abonnes: 0, day: '' }, JSON.parse(localStorage.getItem(storeKey()) || '{}')); } catch (e) { /* stockage indisponible */ }
    const today = new Date().toDateString();
    if (V.day !== today) { V.abonnes = 0; V.day = today; }   // compteur de la session : remis à zéro chaque jour
  }
  function saveVars() { try { localStorage.setItem(storeKey(), JSON.stringify(V)); } catch (e) { /* idem */ } }

  // ---------- Lecture d'une ligne IRC ----------
  // @badges=…;color=…;display-name=… :nick!nick@nick.tmi.twitch.tv PRIVMSG #chaine :message
  function parse(line) {
    const m = { tags: {}, prefix: '', command: '', params: [], text: '' };
    let i = 0;
    if (line[0] === '@') {
      const end = line.indexOf(' ');
      for (const kv of line.slice(1, end).split(';')) {
        const eq = kv.indexOf('=');
        m.tags[kv.slice(0, eq)] = kv.slice(eq + 1).replace(/\\s/g, ' ').replace(/\\:/g, ';').replace(/\\\\/g, '\\');
      }
      i = end + 1;
    }
    if (line[i] === ':') { const end = line.indexOf(' ', i); m.prefix = line.slice(i + 1, end); i = end + 1; }
    const t = line.indexOf(' :', i);
    const head = (t === -1 ? line.slice(i) : line.slice(i, t)).split(' ').filter(Boolean);
    m.command = head[0] || '';
    m.params = head.slice(1);
    if (t !== -1) m.text = line.slice(t + 2);
    return m;
  }

  // Message découpé en morceaux de texte et d'emotes (positions en caractères Unicode)
  function pieces(text, emotes) {
    const chars = Array.from(text);
    const ranges = [];
    for (const part of (emotes || '').split('/').filter(Boolean)) {
      const [id, pos] = part.split(':');
      for (const r of (pos || '').split(',')) {
        const [a, b] = r.split('-').map(Number);
        if (Number.isFinite(a) && Number.isFinite(b)) ranges.push({ a, b, id });
      }
    }
    ranges.sort((x, y) => x.a - y.a);
    const out = [];
    let k = 0;
    for (const r of ranges) {
      if (r.a > k) out.push({ text: chars.slice(k, r.a).join('') });
      out.push({ emote: `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(r.id)}/default/dark/2.0`, alt: chars.slice(r.a, r.b + 1).join('') });
      k = r.b + 1;
    }
    if (k < chars.length) out.push({ text: chars.slice(k).join('') });
    return out;
  }

  const badgesOf = tags => (tags.badges || '').split(',').map(b => b.split('/')[0]).filter(Boolean);
  const nameOf = (tags, prefix) => tags['display-name'] || (prefix.split('!')[0] || '');

  function emit(ev) {
    for (const fn of listeners) { try { fn(ev); } catch (e) { console.error(e); } }
  }

  function handle(m) {
    if (m.command === 'PING') { ws.send('PONG :' + (m.text || 'tmi.twitch.tv')); return; }
    if (m.command === '001') { retry = 1000; emit({ type: 'status', ok: true }); return; }
    const t = m.tags;
    if (m.command === 'PRIVMSG') {
      let text = m.text, action = false;
      const me = text.match(/^\u0001ACTION (.*)\u0001$/);
      if (me) { text = me[1]; action = true; }
      const user = nameOf(t, m.prefix);
      emit({ type: 'chat', id: t.id, user, login: (m.prefix.split('!')[0] || '').toLowerCase(), color: t.color || '', badges: badgesOf(t), text, action, parts: pieces(text, t.emotes) });
      const bits = parseInt(t.bits, 10);
      if (bits > 0) {
        V.bits = `${user} · ${bits} bits`;
        saveVars();
        emit({ type: 'bits', user, amount: bits, text });
      }
    } else if (m.command === 'USERNOTICE') {
      const id = t['msg-id'], user = nameOf(t, m.prefix);
      if (id === 'sub' || id === 'resub') {
        const months = parseInt(t['msg-param-cumulative-months'], 10) || 1;
        V.abonne = user; V.abonnes++;
        saveVars();
        emit({ type: 'sub', user, months, text: m.text });
      } else if (id === 'subgift' || id === 'anonsubgift') {
        // chaque abonnement offert d'un lot arrive aussi un par un : on ne compte que ceux-ci
        V.abonne = t['msg-param-recipient-display-name'] || V.abonne; V.abonnes++;
        saveVars();
        if (!t['msg-param-community-gift-id']) emit({ type: 'gift', user: id === 'anonsubgift' ? 'Anonyme' : user, count: 1, to: t['msg-param-recipient-display-name'] || '' });
      } else if (id === 'submysterygift' || id === 'anonsubmysterygift') {
        emit({ type: 'gift', user: id === 'anonsubmysterygift' ? 'Anonyme' : user, count: parseInt(t['msg-param-mass-gift-count'], 10) || 1 });
      } else if (id === 'raid') {
        const who = t['msg-param-displayName'] || user, viewers = parseInt(t['msg-param-viewerCount'], 10) || 0;
        V.raid = `${who} · ${viewers} spectateurs`;
        saveVars();
        emit({ type: 'raid', user: who, viewers });
      }
    } else if (m.command === 'CLEARCHAT') {
      emit({ type: 'clear', login: (m.text || '').toLowerCase() });       // vide : tout le tchat
    } else if (m.command === 'CLEARMSG') {
      emit({ type: 'delete', id: t['target-msg-id'] });
    }
  }

  function open() {
    clearTimeout(timer);
    if (ws) { ws.onclose = null; ws.close(); ws = null; }
    if (!channel) return;
    const sock = ws = new WebSocket(URL);
    sock.onopen = () => {
      sock.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      sock.send('PASS SCHMOOPIIE');                                    // connexion anonyme (lecture seule)
      sock.send('NICK justinfan' + Math.floor(10000 + Math.random() * 80000));
      sock.send('JOIN #' + channel);
    };
    sock.onmessage = e => String(e.data).split('\r\n').filter(Boolean).forEach(l => handle(parse(l)));
    sock.onclose = () => {
      emit({ type: 'status', ok: false });
      timer = setTimeout(open, retry);
      retry = Math.min(30000, retry * 2);                               // reconnexion de plus en plus espacée
    };
  }

  // Suit une chaîne (rien ne se passe si c'est déjà elle) ; '' coupe la connexion
  function follow(name) {
    name = String(name || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (name === channel) return;
    channel = name;
    loadVars();
    open();
  }

  function value(k) {
    const f = k.split('.')[1];
    return f === 'abonnes' ? String(V.abonnes || 0) : String(V[f] || '');
  }

  // Évènement fictif : bouton « Tester » de l'onglet Habillage
  function sample(type) {
    return {
      sub: { type: 'sub', user: 'SuperSupporter', months: 12 },
      gift: { type: 'gift', user: 'Généreux', count: 5 },
      raid: { type: 'raid', user: 'ChaineAmie', viewers: 42 },
      bits: { type: 'bits', user: 'Pluie2Bits', amount: 500, text: '' },
      chat: { type: 'chat', id: 't' + Date.now(), user: 'Spectateur', login: 'spectateur', color: '#2bd46b', badges: ['subscriber'], text: 'Allez allez ! Quel match 🔥', parts: [{ text: 'Allez allez ! Quel match 🔥' }] }
    }[type] || null;
  }

  return { follow, on: fn => listeners.push(fn), value, sample, get channel() { return channel; } };
})();
