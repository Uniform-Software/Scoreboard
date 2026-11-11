# Karting (Apex Timing) — design

Date : 2026-11-10 · validé en conversation (« oui go »).

## Objectif

Ajouter le karting comme sport : lecture du live timing Apex Timing à partir du lien d'un circuit,
overlays de course (classement, bandeau, mini map, fiche pilote, duel, résultats) et outils de régie.
Courses visées : sprint / championnat, endurance, loisir.

## Protocole Apex (relevé le 2026-11-10)

- Page : `https://www.apex-timing.com/live-timing/<circuit>/index.html` ; `javascript/config.js`
  donne `configPort` (ex. Espoey 9450). Flux : `wss://live-data.apex-timing.com:<port+3>/`, sans compte.
- Messages : lignes `clé|classe|valeur`.
  - `init|r|` (course), `init|b|` / `init|p|` (meilleur temps), `init|n|` (pas de live).
  - `grid||<tbody>…` : tableau HTML. Ligne d'en-tête `r0` : colonnes `cN` avec `data-type`
    (grp, sta, rk, no, dr, llp, blp, gap, int, tlp, otr, pit, s1…s3, nat…). Lignes `rX` (`data-pos`).
  - `rXcY|classe|texte` : mise à jour d'une case (tn normal, ti record perso, tb meilleur de la session).
  - `rX|#|pos` : position ; `rX|*|ms` : passage de ligne + durée prévue du tour ;
    `rX|*i1|`, `*i2` : secteurs ; `*in`, `*out` : stands.
  - `dyn1|countdown|ms` (temps restant) / `count` / `text` ; `light|lg/ly/lr/lf|` (drapeau) ;
    `title1`, `title2`, `track`, `com`, `msg`, `css|noN|…` (couleurs des numéros de kart).
- Tracé : `ftp/tracks.json` du circuit (chemins SVG piste, s1–s3, in, out, viewBox, durées).

## Architecture

- `data/karting.json` (fichier d'état, régie) : lien, hôte, port, titre, tracé retenu (chemins SVG
  validés), noms par numéro de kart, réglages des overlays, mode démo `{on, start, seed}`.
- `admin/apex.php` : résout un lien (apex-timing.com uniquement) → port, titre, liste des tracés.
- `assets/apex.js` : connexion WebSocket, analyse, modèle (session, pilotes triés, évènements :
  meilleur tour, drapeau, dépassement), estimation de position sur le tracé.
  Simulateur démo déterministe (graine + heure de départ) : tous les écrans voient la même course.
- Sport `karting` dans sports.json. Studio : console de course à la place de la console de score,
  tuiles `k-tower`, `k-bar`, `k-map`, `k-driver`, `k-duel`, `k-results` (au lieu de score /
  compositions / remplacement). Même circuit aperçu / Prendre / Stream Deck.
- `overlay/karting.html` dans `overlay/` (tout-en-un) ; n'affiche rien hors karting.

## Étapes

1. Connexion, réglages (Match), console Studio, classement (tower), bandeau course, démo.
2. Mini map (tracé Apex, points interpolés, recalage aux passages, stands).
3. Fiche pilote, duel, résultats / grille, bandeaux automatiques, endurance (équipe, relais, arrêts).
