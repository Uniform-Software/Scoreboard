# Scoreboard

Habillage broadcast pour retransmettre des matchs dans OBS : un **scoreboard** (score, chrono, sets) et un écran de **compositions d'équipes**, pilotés depuis une **régie** web (ordinateur, tablette ou téléphone).

Sports gérés : football, rugby, handball, basket, volley-ball.

## Arborescence

```
index.html            Page d'accueil (liens vers la régie et les overlays)
admin/                Régie, protégée par mot de passe (.htaccess)
  score.html          Contrôle du score et du chrono
  equipes.html        Contrôle des compositions
  ecrire.php          Enregistre les modifications
overlay/              Pages à ajouter dans OBS (fond transparent, 1920 × 1080)
  score.html          Scoreboard
  equipes.html        Compositions
api/
  lire.php            Lecture des données (public)
  etat.php            Fonctions communes (vérification, écriture)
assets/
  sports.json         Réglages des sports : périodes, points, règles
  commun.js           Code partagé (synchro, chrono, aperçu…)
  admin.css           Style de la régie
  overlay.css         Base des overlays
data/                 Données du match (créées automatiquement, accès direct interdit)
logos/                Logos des équipes (pour l'écran des compositions)
```

## Installation

1. Envoyer le dossier sur un hébergement **Apache + PHP 7.4 ou plus**.
2. Vérifier que le dossier `data/` est **accessible en écriture** par PHP.
3. Protéger la régie :
   - créer un fichier de mots de passe, hors du dossier public si possible :
     `htpasswd -c /chemin/absolu/.htpasswd regie`
   - mettre ce chemin absolu dans `admin/.htaccess` (ligne `AuthUserFile`).

   Tant que ce chemin n'est pas bon, la régie renvoie une erreur 500 : elle n'est jamais ouverte à tout le monde par erreur.
4. Vérifier : sans identifiants, `curl -X POST https://ton-site/admin/ecrire.php` doit répondre **401**.

## OBS

Ajouter une **source navigateur** de 1920 × 1080 pour chaque overlay :

- `https://ton-site/overlay/score.html`
- `https://ton-site/overlay/equipes.html`

Réglages possibles dans l'adresse du scoreboard :

| Paramètre | Valeurs | Exemple |
|---|---|---|
| `pos` | `haut-gauche` (par défaut), `haut-centre`, `haut-droite`, `bas-gauche`, `bas-centre` | `?pos=bas-centre` |
| `taille` | 0.4 à 3 | `?taille=1.2` |
| `accent` | couleur hexadécimale sans `#` | `?accent=ff5500` |

`accent` fonctionne aussi sur l'écran des compositions. Les paramètres se combinent : `?pos=haut-centre&taille=1.2`.

Le bouton **À l'antenne / Hors antenne** de la régie fait entrer ou sortir l'overlay avec une animation : inutile de couper la source dans OBS.

## Régie

- Plusieurs personnes peuvent piloter le même match en même temps (par exemple une au score, une au chrono) : les modifications ne s'écrasent pas.
- Raccourcis clavier (page Score) : `Espace` chrono, `A` / `Q` +/− équipe de gauche, `P` / `M` +/− équipe de droite, `H` afficher / masquer, `Ctrl+Z` annuler.
- Compositions : une ligne par joueur, `10 Léo Martin`. Ajouter `(C)` pour le capitaine.
- Logos : déposer l'image dans `logos/` et taper son nom (`iut.png`), ou coller une adresse `https://…`.

## Ajouter ou modifier un sport

Tout se règle dans `assets/sports.json`, que lisent à la fois la régie, les overlays et le serveur :

```jsonc
"hand": {
  "label": "Handball",
  "clock": "up",                  // "up" (croissant), "down" (décroissant) ou false
  "added": false,                 // temps additionnel affichable (football)
  "periods": [
    { "name": "1re mi-temps", "short": "1re MT", "len": 30 }   // len en minutes, 0 = pas de chrono
  ],
  "points": [
    { "value": 1, "label": "But", "banner": false }            // banner : bandeau animé sur l'overlay
  ],
  "time": "…", "rules": ["…"]
}
```

Pour un sport à sets (comme le volley), on remplace le chrono par `"sets": { "win": 3, "points": 25, "last": 15 }`.

Un chrono croissant enchaîne les périodes (la 2e mi-temps démarre à 45:00). Un chrono décroissant repart de la durée de la période et s'arrête tout seul à 0.
