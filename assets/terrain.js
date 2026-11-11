// terrain.js : terrains et compositions, partagé par la régie (onglet Match) et l'overlay des compositions.
//  - Terrain.svg()    : tracé d'un terrain (demi-terrain, ou terrain entier pour le « face à face »)
//  - Terrain.point()  : position d'un poste à l'écran, en pourcentage du terrain dessiné
//  - Terrain.place()  : placement automatique des titulaires sur les postes d'une formation
'use strict';

const Terrain = (() => {
  // Demi-terrain réel, en mètres : largeur W, profondeur L. La ligne médiane est en haut (y = 0),
  // le but ou la ligne de fond en bas (y = L). L'équipe attaque vers le haut.
  const DIMS = { foot: [68, 52.5], rugby: [70, 50], hand: [20, 20], basket: [15, 14], volley: [9, 9] };

  // Tracé d'un demi-terrain (en mètres). pathLength="1" : chaque trait peut se « dessiner » à l'entrée.
  const P = 'pathLength="1"';
  const LINES = {
    foot: [
      `<rect ${P} x="0" y="0" width="68" height="52.5"/>`,
      `<path ${P} d="M24.85 0 A9.15 9.15 0 0 0 43.15 0"/>`,               // rond central
      `<circle class="dot" cx="34" cy="0" r=".35"/>`,
      `<rect ${P} x="13.84" y="36" width="40.32" height="16.5"/>`,         // surface de réparation
      `<rect ${P} x="24.84" y="47" width="18.32" height="5.5"/>`,          // surface de but
      `<circle class="dot" cx="34" cy="41.5" r=".35"/>`,
      `<path ${P} d="M26.69 36 A9.15 9.15 0 0 1 41.31 36"/>`               // arc de la surface
    ],
    rugby: [
      `<rect ${P} x="0" y="0" width="70" height="50"/>`,
      `<line ${P} class="dash" x1="0" y1="10" x2="70" y2="10"/>`,          // 10 m
      `<line ${P} x1="0" y1="28" x2="70" y2="28"/>`,                       // 22 m
      `<line ${P} class="dash" x1="0" y1="45" x2="70" y2="45"/>`,          // 5 m
      `<line ${P} class="dash" x1="5" y1="0" x2="5" y2="50"/>`,
      `<line ${P} class="dash" x1="65" y1="0" x2="65" y2="50"/>`
    ],
    hand: [
      `<rect ${P} x="0" y="0" width="20" height="20"/>`,
      `<path ${P} d="M2.5 20 A6 6 0 0 1 8.5 14 L11.5 14 A6 6 0 0 1 17.5 20"/>`,          // zone des 6 m
      `<path ${P} class="dash" d="M0 17.04 A9 9 0 0 1 8.5 11 L11.5 11 A9 9 0 0 1 20 17.04"/>`, // 9 m
      `<line ${P} x1="9.5" y1="13" x2="10.5" y2="13"/>`                    // 7 m
    ],
    basket: [
      `<rect ${P} x="0" y="0" width="15" height="14"/>`,
      `<path ${P} d="M5.7 0 A1.8 1.8 0 0 0 9.3 0"/>`,                      // rond central
      `<rect ${P} x="5.05" y="8.2" width="4.9" height="5.8"/>`,            // raquette
      `<circle ${P} cx="7.5" cy="8.2" r="1.8"/>`,                          // lancer franc
      `<path ${P} d="M0.9 14 L0.9 11.01 A6.75 6.75 0 0 1 14.1 11.01 L14.1 14"/>`, // ligne à 3 points
      `<line ${P} x1="6.6" y1="13.2" x2="8.4" y2="13.2"/>`,                // planche
      `<circle class="dot" cx="7.5" cy="12.43" r=".3"/>`
    ],
    volley: [
      `<rect ${P} x="0" y="0" width="9" height="9"/>`,
      `<line ${P} x1="0" y1="3" x2="9" y2="3"/>`,                          // ligne d'attaque
      `<line ${P} class="net" x1="-.6" y1="0" x2="9.6" y2="0"/>`           // filet
    ]
  };

  const dims = kind => DIMS[kind] || DIMS.foot;

  // mode 'half' : un demi-terrain. mode 'full' : terrain entier, l'équipe de gauche à gauche.
  function svg(kind, mode = 'half') {
    const [W, L] = dims(kind);
    const half = (LINES[kind] || LINES.foot).join('');
    const lw = `style="--lw:${(W / 340).toFixed(3)}"`;      // épaisseur des traits, à l'échelle du terrain
    if (mode === 'half') {
      return `<svg class="pitch-svg" viewBox="0 0 ${W} ${L}" ${lw} aria-hidden="true">`
        + `<rect class="turf" x="0" y="0" width="${W}" height="${L}"/><g class="lines">${half}</g></svg>`;
    }
    // terrain entier couché : deux demi-terrains tournés, la ligne médiane au centre
    return `<svg class="pitch-svg" viewBox="0 0 ${2 * L} ${W}" ${lw} aria-hidden="true">`
      + `<rect class="turf" x="0" y="0" width="${2 * L}" height="${W}"/>`
      + `<g class="lines" transform="matrix(0 1 -1 0 ${L} 0)">${half}</g>`
      + `<g class="lines" transform="matrix(0 -1 1 0 ${L} ${W})">${half}</g></svg>`;
  }

  // Rapport largeur / hauteur du terrain dessiné
  function ratio(kind, mode = 'half') {
    const [W, L] = dims(kind);
    return mode === 'half' ? W / L : (2 * L) / W;
  }

  // Poste (x, y en % du demi-terrain) -> position en % du terrain dessiné.
  // Une marge garde les pions (gardien sur sa ligne, ailiers) entièrement sur le terrain.
  function point(mode, side, x, y) {
    x = 7 + x * 0.86;
    y = 5 + y * 0.88;
    if (mode === 'half') return { left: x, top: y };
    return side === 'home'
      ? { left: (100 - y) / 2, top: x }            // équipe de gauche : attaque vers la droite
      : { left: 50 + y / 2, top: 100 - x };        // équipe de droite : attaque vers la gauche
  }

  // Placement automatique. Pour chaque poste, dans l'ordre :
  //  1. placement fait à la main (overrides : { idPoste: idJoueur }),
  //  2. joueur dont le poste habituel correspond (de préférence avec le numéro d'usage),
  //  3. joueur portant le numéro d'usage du poste,
  //  4. titulaires restants, dans l'ordre de la liste.
  // Renvoie [{ slot, player }], player valant null s'il manque des titulaires.
  function place(sp, formation, starters, overrides = {}) {
    const slots = formation ? formation.slots : [];
    const used = new Set();
    const out = slots.map(slot => ({ slot, player: null }));
    const nums = slot => slot.n || (sp.numbers && sp.numbers[slot.role]) || [];
    const take = (o, p) => { o.player = p; used.add(p.id); };
    const free = () => starters.filter(p => !used.has(p.id));

    for (const o of out) {
      const p = starters.find(p => p.id === overrides[o.slot.id] && !used.has(p.id));
      if (p) take(o, p);
    }
    for (const o of out) {
      if (o.player) continue;
      const cands = free().filter(p => p.pos === o.slot.role);
      const best = cands.find(p => nums(o.slot).includes(+p.number)) || cands[0];
      if (best) take(o, best);
    }
    for (const o of out) {
      if (o.player) continue;
      const p = free().find(p => nums(o.slot).includes(+p.number));
      if (p) take(o, p);
    }
    for (const o of out) {
      if (o.player) continue;
      const p = free()[0];
      if (p) take(o, p);
    }
    return out;
  }

  return { svg, ratio, point, place, dims };
})();
