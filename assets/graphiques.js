// graphiques.js : rendu des graphiques personnalisés, partagé par l'éditeur (admin/graphiques.html)
// et l'overlay (overlay/graphiques.html). Un graphique est une liste de calques posés sur l'écran
// 1920 × 1080 : bloc de couleur, texte (avec champs en direct), image, hachures.
'use strict';

const Graph = (() => {
  // Champs en direct, insérés dans un texte sous la forme {home.name}
  const FIELDS = [
    ['home.name', 'Nom (gauche)'], ['home.code', 'Abréviation (gauche)'], ['home.score', 'Score (gauche)'],
    ['away.name', 'Nom (droite)'], ['away.code', 'Abréviation (droite)'], ['away.score', 'Score (droite)'],
    ['clock', 'Chrono'], ['period', 'Période'], ['title', 'Compétition'], ['scorer', 'Dernier marqueur'],
    ['twitch.abonne', 'Twitch : dernier abonné'], ['twitch.abonnes', 'Twitch : abonnés du jour'],
    ['twitch.raid', 'Twitch : dernier raid'], ['twitch.bits', 'Twitch : derniers bits']
  ];
  // Valeurs d'exemple des champs Twitch dans l'éditeur (qui ne se connecte pas au tchat)
  const TWITCH_DEMO = { abonne: 'SuperSupporter', abonnes: '12', raid: 'ChaineAmie · 42 spectateurs', bits: 'Pluie2Bits · 500 bits' };

  // Couleurs du thème ou des équipes, ou couleur libre (#rrggbb)
  const COLORS = [['accent', 'Accent'], ['ink', 'Noir'], ['paper', 'Blanc'], ['home', 'Équipe de gauche'], ['away', 'Équipe de droite'],
    ['home2', 'Texte sur gauche'], ['away2', 'Texte sur droite']];

  function color(c, S) {
    if (!c) return 'var(--accent)';
    if (c[0] === '#') return c;
    if (c === 'accent' || c === 'ink' || c === 'paper') return `var(--${c})`;
    const t = S && S[c.replace('2', '')];
    if (!t) return 'var(--accent)';
    return c.endsWith('2') ? SB.textColor(t.color) : t.color;
  }

  function value(k, S, E) {
    if (k.startsWith('twitch.')) {
      return typeof Twitch !== 'undefined' && Twitch.channel ? Twitch.value(k) : (typeof Twitch === 'undefined' ? TWITCH_DEMO[k.split('.')[1]] || '' : '');
    }
    if (!S) return '';
    const [side, f] = k.split('.');
    if (f && S[side]) return f === 'code' ? SB.code(S[side]) : String(S[side][f] ?? '');
    if (k === 'clock') return SB.hasClock(S) ? SB.fmt(SB.clockMs(S), SB.sport(S.sport).clock === 'down') : (SB.period(S) ? SB.period(S).short : '');
    if (k === 'period') return SB.period(S) ? SB.period(S).short : '';
    if (k === 'title') return (E && E.title) || '';
    if (k === 'scorer') {
      const last = [...S.scorers].reverse().find(x => x.player);
      return last ? SB.shortName(last.player) + (last.minute ? ' ' + last.minute : '') : '';
    }
    return '';
  }
  // Variables du graphique ({v.joueur}) : remplacées dès la construction, modifiables depuis le Studio
  const vars = (text, g) => String(text || '').replace(/\{v\.([a-z0-9]+)\}/g, (m, id) => {
    const v = g && (g.vars || []).find(x => x.id === id);
    return v ? v.value : '';
  });
  const fill = (text, S, E) => String(text || '').replace(/\{([a-z.]+)\}/g, (m, k) => value(k, S, E));

  function source(src, S) {
    if (src === 'home.logo' || src === 'away.logo') return S ? SB.logoUrl(S[src.split('.')[0]].logo) : '';
    return SB.logoUrl(src);
  }

  // Construit les calques d'un graphique dans root (un bloc de 1920 × 1080)
  function render(root, g, S, E) {
    root.replaceChildren();
    g.layers.forEach((l, i) => {
      if (l.hidden) return;
      const d = document.createElement('div');
      d.className = 'gl gl-' + l.type;
      d.dataset.layer = l.id;
      d.style.setProperty('--i', i);
      Object.assign(d.style, {
        left: l.x + 'px', top: l.y + 'px', width: l.w + 'px', height: l.h + 'px', borderRadius: l.radius + 'px'
      });
      d.style.setProperty('--o', l.opacity);     // opacité du calque (variable : l'animation garde la main)
      if (l.type === 'block') d.style.background = color(l.color, S);
      if (l.type === 'hatch') { d.classList.add('hatch'); d.style.color = color(l.color, S); }
      if (l.type === 'text') {
        Object.assign(d.style, {
          color: color(l.color, S), fontSize: l.size + 'px', fontWeight: l.weight,
          fontStretch: { normal: '100%', cond: '75%', wide: '125%' }[l.stretch],
          justifyContent: { left: 'flex-start', center: 'center', right: 'flex-end' }[l.align],
          textAlign: l.align, textTransform: l.upper ? 'uppercase' : 'none'
        });
        const span = document.createElement('span');
        span.dataset.tpl = vars(l.text, g);
        span.textContent = fill(l.text, S, E);
        d.append(span);
      }
      if (l.type === 'image') {
        const src = source(l.src, S);
        if (src) {
          const img = new Image();
          img.src = src;
          img.style.objectFit = l.fit;
          d.append(img);
        } else d.classList.add('empty');
      }
      root.append(d);
    });
  }

  // Met à jour les champs en direct (chrono, score…) sans reconstruire
  function update(root, S, E) {
    for (const span of root.querySelectorAll('[data-tpl]')) {
      const t = fill(span.dataset.tpl, S, E);
      if (span.textContent !== t) span.textContent = t;
    }
  }

  const uid = () => SB.uid();
  const layer = (type, o = {}) => Object.assign({
    id: uid(), type, x: 760, y: 440, w: 400, h: 200, color: type === 'text' ? 'ink' : 'accent', radius: type === 'block' ? 12 : 0,
    opacity: 1, hidden: false, text: type === 'text' ? 'Texte' : '', size: 48, weight: 800, stretch: 'cond', align: 'left', upper: true,
    src: '', fit: 'contain'
  }, o);

  // Modèles prêts à l'emploi
  const TEMPLATES = {
    sponsor: () => ({ name: 'Sponsor (coin)', anim: 'slide', layers: [
      layer('block', { x: 1560, y: 48, w: 312, h: 132, color: 'paper', radius: 14 }),
      layer('image', { x: 1584, y: 62, w: 264, h: 104 }),
      layer('text', { x: 1560, y: 186, w: 312, h: 28, text: 'Partenaire officiel', size: 16, weight: 700, stretch: 'wide', align: 'center', color: 'paper' })
    ] }),
    homme: () => ({ name: 'Homme du match', anim: 'slabs', vars: [{ id: 'joueur', label: 'Joueur', value: 'Prénom Nom' }], layers: [
      layer('block', { x: 110, y: 600, w: 760, h: 300, color: 'paper', radius: 18 }),
      layer('block', { x: 110, y: 600, w: 260, h: 300, color: 'home', radius: 18 }),
      layer('image', { x: 130, y: 620, w: 220, h: 260, fit: 'cover', radius: 12 }),
      layer('block', { x: 400, y: 630, w: 280, h: 44, color: 'accent', radius: 8 }),
      layer('text', { x: 416, y: 630, w: 260, h: 44, text: 'Homme du match', size: 20, weight: 700, stretch: 'wide', color: 'paper' }),
      layer('text', { x: 400, y: 700, w: 450, h: 90, text: '{v.joueur}', size: 62, weight: 800, stretch: 'cond', color: 'ink' }),
      layer('text', { x: 400, y: 800, w: 450, h: 50, text: '{home.name}', size: 30, weight: 700, stretch: 'cond', color: 'home' })
    ] }),
    mini: () => ({ name: 'Score + chrono minimal', anim: 'slide', layers: [
      layer('block', { x: 64, y: 980, w: 460, h: 60, color: 'ink', radius: 12 }),
      layer('text', { x: 84, y: 980, w: 300, h: 60, text: '{home.code} {home.score} – {away.score} {away.code}', size: 34, color: 'paper' }),
      layer('block', { x: 384, y: 980, w: 140, h: 60, color: 'accent', radius: 12 }),
      layer('text', { x: 384, y: 980, w: 140, h: 60, text: '{clock}', size: 32, weight: 700, stretch: 'normal', align: 'center', color: 'paper' })
    ] }),
    prochain: () => ({ name: 'Prochain match', anim: 'slabs', vars: [
      { id: 'affiche', label: 'Affiche', value: 'Équipe A – Équipe B' }, { id: 'horaire', label: 'Horaire et lieu', value: '16h00 · Terrain 2' }], layers: [
      layer('block', { x: 560, y: 820, w: 800, h: 150, color: 'paper', radius: 18 }),
      layer('block', { x: 760, y: 790, w: 400, h: 52, color: 'accent', radius: 10 }),
      layer('text', { x: 760, y: 790, w: 400, h: 52, text: 'Prochain match', size: 22, weight: 700, stretch: 'wide', align: 'center', color: 'paper' }),
      layer('text', { x: 580, y: 850, w: 760, h: 70, text: '{v.affiche}', size: 58, align: 'center' }),
      layer('text', { x: 580, y: 920, w: 760, h: 40, text: '{v.horaire}', size: 24, weight: 700, stretch: 'normal', align: 'center', color: 'ink' })
    ] }),
    vide: () => ({ name: 'Nouveau graphique', anim: 'slabs', layers: [layer('block', { x: 660, y: 440, w: 600, h: 200 })] })
  };

  // Identifiant d'une variable à partir de son nom (« Nom du joueur » → nomdujoueur)
  const varId = (label, taken = []) => {
    let base = String(label || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'texte';
    let id = base, n = 2;
    while (taken.includes(id)) id = base.slice(0, 14) + n++;
    return id;
  };

  return { FIELDS, COLORS, render, update, layer, TEMPLATES, color, fill, vars, varId };
})();
