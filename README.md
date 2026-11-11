# Scoreboard

Développé par **Uniform Systems (UNI)**.

Habillage broadcast pour retransmettre des matchs dans OBS : un **scoreboard** dont le style s'adapte au sport, un écran de **compositions d'équipes** et un overlay d'**infos** (bandeau nom, remplacement, carton central, bandeau défilant), pilotés depuis une **régie** web (ordinateur, tablette ou téléphone).

Sports gérés : football, rugby, handball, basket, volley-ball.

## Direction artistique

Flat : aplats de couleur, coins arrondis, ni dégradé ni ombre. Base noir et blanc, une couleur d'accent (bleu UNI `#2448ff`), et la couleur de chaque équipe en pastille ou en aplat. Typographie [Archivo](https://fonts.google.com/specimen/Archivo) : étroite et grasse pour les noms et les chiffres, élargie pour les petites étiquettes.

Pour changer l'accent partout : `--accent` dans `assets/overlay.css` (overlays) et `assets/admin.css` (régie), ou `?accent=rrggbb` dans l'adresse d'un overlay. La couleur du texte posé sur l'accent s'adapte toute seule.

La régie suit le thème du système (clair ou sombre).

## Arborescence

```
index.html            Page d'accueil (liens vers la régie et les overlays)
admin/                Régie, protégée par mot de passe (.htaccess)
  index.html          Studio (page principale) : aperçu / programme et une carte par élément
  match.html          Match : sport, clubs du match, compositions, compétition, Stream Deck
  clubs.html          Clubs : bibliothèque de clubs (couleurs, logo, effectif, photos)
  habillage.html      Habillage : thème, options, positions et tailles des overlays
  graphiques.html     Graphiques : éditeur de graphiques personnalisés
  ecrire.php          Enregistre les modifications
  upload.php          Reçoit les logos et photos
  cle.php             Clés des accès distants (Stream Deck, arbitre, client)
  propositions.php    Fiches envoyées par le panneau client : accepter / refuser
  apex.php            Karting : lit le lien Apex Timing d'un circuit (port, nom, tracés)
arbitre/              Panneau arbitre (téléphone), ouvert avec sa clé : score et chrono
saisie/               Panneau client, ouvert avec sa clé : fiches des clubs à faire valider
overlay/              Pages à ajouter dans OBS (fond transparent, 1920 × 1080)
  index.html          Tous les overlays en une seule source
  score.html          Scoreboard
  equipes.html        Compositions
  infos.html          Infos (bandeau nom, remplacement, carton central, défilant)
  graphiques.html     Graphiques personnalisés
  ecrans.html         Écrans plein cadre, replay, transitions (au-dessus de tout)
  karting.html        Karting : classement, bandeau course, mini map, fiche pilote, duel, résultats
  twitch.html         Tchat et alertes Twitch (source à part, ou overlay/?twitch)
api/
  lire.php            Lecture des données (public)
  action.php          Commandes à distance (Stream Deck / Companion, panneau arbitre), protégées par clé
  saisie.php          Panneau client : lecture des clubs, envoi des fiches et des images
  touche.php          Images de touche Stream Deck : score ou logo d'une équipe
  etat.php            Fonctions communes (vérification, écriture)
assets/
  sports.json         Réglages des sports : périodes, points, règles
  commun.js           Code partagé (synchro, chrono, antenne, animations…)
  studio.js           Page Studio
  match.js            Page Match
  clubs.js            Page Clubs
  habillage.js        Page Habillage
  editeur.js          Page Graphiques
  graphiques.js       Rendu des graphiques (éditeur et overlay)
  terrain.js          Dessin des terrains et placement des joueurs
  twitch.js           Connexion anonyme au tchat Twitch (tchat, alertes, variables)
  apex.js             Karting : flux Apex Timing, modèle de course, position sur le tracé, démo
  stinger-vide.webm   Vidéo transparente d'1 s pour la transition Stinger d'OBS
  fonts/              Police des images de touche Stream Deck (Archivo Black, OFL)
  admin.css           Style de la régie
  overlay.css         Base des overlays
data/                 Données du match (créées automatiquement, accès direct interdit)
uploads/              Logos et photos envoyés depuis la régie (aucun script exécuté)
  attente/            Images du panneau client, en attente de validation
logos/                Logos déposés à la main (ancienne méthode, toujours acceptée)
```

## Installation

1. Envoyer le dossier sur un hébergement **Apache + PHP 7.4 ou plus**.
2. Vérifier que les dossiers `data/` et `uploads/` sont **accessibles en écriture** par PHP. Les images sont réduites dans le navigateur avant l'envoi (photo 400 px, logo 512 px) : la limite PHP `upload_max_filesize` par défaut (2 Mo) suffit.
3. Protéger la régie :
   - créer un fichier de mots de passe, hors du dossier public si possible :
     `htpasswd -c /chemin/absolu/.htpasswd regie`
   - mettre ce chemin absolu dans `admin/.htaccess` (ligne `AuthUserFile`).

   Tant que ce chemin n'est pas bon, la régie renvoie une erreur 500 : elle n'est jamais ouverte à tout le monde par erreur.
4. Vérifier : sans identifiants, `curl -X POST https://ton-site/admin/ecrire.php` doit répondre **401**.

## Tester en local

Il faut un serveur qui **exécute PHP**. Le serveur intégré de PhpStorm, Live Server de VS Code ou l'ouverture directe du fichier ne suffisent pas : ils renvoient le code source des `.php`, et la régie affiche « PHP n'est pas exécuté par ce serveur ».

```bash
brew install php
php -S localhost:8000
```

À lancer depuis le dossier du projet, puis ouvrir http://localhost:8000. En local, `.htaccess` n'est pas appliqué : la régie n'a pas de mot de passe.

## OBS

Le plus simple : **une seule source navigateur** de 1920 × 1080 avec `https://ton-site/overlay/`. Elle contient le scoreboard, les compositions et les infos.

On peut aussi ajouter chaque overlay séparément :

- `https://ton-site/overlay/score.html`
- `https://ton-site/overlay/equipes.html`
- `https://ton-site/overlay/infos.html`
- `https://ton-site/overlay/graphiques.html`

Le scoreboard change de style selon le sport :

| Sport | Style | Particularités |
|---|---|---|
| Football | `barre` (haut gauche) | temps additionnel, cartons rouges, buteurs et minute (« 45+2' ») |
| Handball | `barre` (haut gauche) | exclusions de 2 minutes avec compte à rebours |
| Rugby | `barre-gauche` | chrono à gauche, marqueurs, cartons jaunes (10 min) avec compte à rebours |
| Volley-ball | `empile` | une ligne par équipe, scores des sets joués, service, balle de set |
| Basket | `basket` (bas centre) | fautes d'équipe et bonus, horloge des tirs (24 / 14 s) |

Réglages possibles dans l'adresse du scoreboard :

| Paramètre | Valeurs | Exemple |
|---|---|---|
| `style` | `barre`, `barre-gauche`, `empile`, `basket` (impose un style) | `?style=barre` |
| `pos` | `haut-gauche` (par défaut), `haut-centre`, `haut-droite`, `bas-gauche`, `bas-centre` | `?pos=bas-centre` |
| `taille` | 0.4 à 3 | `?taille=1.2` |
| `accent` | couleur hexadécimale sans `#` | `?accent=ff5500` |

`accent` fonctionne aussi sur l'écran des compositions. Les paramètres se combinent : `?pos=haut-centre&taille=1.2`.

Inspirés des diffusions de Ligue 1, LaLiga, Premier League, Top 14 et Tournoi des Six Nations :

- **Abréviations et blasons** : chaque équipe a une abréviation (PSG, OM, UBB…) et un logo facultatif. L'option « Abréviations » de l'onglet Habillage passe le scoreboard en version compacte. Le logo remplace la pastille de couleur.
- **Marqueurs** : après un but ou un essai, la régie propose la liste des joueurs (depuis les compositions). Le nom et la minute s'ajoutent au bandeau (« BUT ! · K. MBAPPÉ · 23' ») et au carton de mi-temps de l'overlay d'infos.
- **Exclusions temporaires** : carton jaune au rugby, 2 minutes au handball. Le temps restant s'affiche sous l'équipe et ne s'écoule que quand le chrono tourne.
- **Mi-temps / Fin / Pause** : s'affiche à la place du chrono (comme les HT / FT des diffuseurs anglais).

### Régie : Studio et Match

La régie a cinq onglets : Studio, Match, Clubs, Habillage, Graphiques.

- **Studio** (page principale, `/admin/`) : comme le mode studio d'OBS, deux moniteurs **Aperçu** (vert) et **Programme** (rouge) et le bouton **Prendre**. Dessous, une **barre d'éléments** qui reste toujours visible (une tuile par élément, + Prendre), puis la console de score à gauche et les réglages de l'élément choisi à droite (onglets) :
  - Scoreboard : la console de match (points, chrono, périodes, mi-temps / fin, compteurs, marqueurs, exclusions…) ;
  - Bandeau nom, Remplacement, Carton central, Bandeau défilant : leurs textes et options ;
  - Compositions : résumé, saisie dans l'onglet Match.
- **Match** : les grands paramètres, en quatre sous-onglets (Équipes et compositions, Sport et match, Sorties OBS, Stream Deck ; `match.html#streamdeck` ouvre directement le bon). Sport, club de chaque côté, composition (titulaires, remplaçants, dispositif), compétition, sorties OBS, Stream Deck, remise à zéro.

Le nom, la couleur et le logo d'un club sont saisis une seule fois (onglet Clubs) et servent partout.

### Clubs

Bibliothèque réutilisable d'un match à l'autre (tournoi, saison) : nom, abréviation, deux couleurs, logo, sport, entraîneur, et l'effectif (numéro, prénom, nom, poste, photo, capitaine). Déposer une image sur le logo ou la photo pour l'envoyer. « Coller une liste » accepte une ligne par joueur (`10 Léo Martin MIL (C)`).

Dans l'onglet Match, on choisit un club par côté : son nom, ses couleurs et son logo passent dans le scoreboard, et ses premiers joueurs deviennent titulaires (à ajuster avec les boutons T / R).

Les anciennes données (équipes saisies dans l'onglet Match, compositions en texte) sont converties en clubs à la première ouverture.

### Compositions sur terrain

L'écran des compositions dessine un demi-terrain par équipe (ou le terrain entier en mode « face à face ») avec la photo des joueurs, ou une silhouette à leur couleur s'il n'y en a pas. Les joueurs sont placés selon le dispositif du sport : 4-4-2, 4-3-3, 4-2-3-1, 4-3-1-2… au football, numéros 1 à 15 au rugby, 6 + libéro ou 4 joueurs (4 × 4) au volley, etc. Le nombre de titulaires suit la formation choisie. (`formations` dans `assets/sports.json`). Le placement suit le poste puis le numéro ; dans l'onglet Match, cliquer deux joueurs sur le mini-terrain les échange.

Deux mises en page, au choix dans la carte Compositions du Studio : **face à face** (les deux équipes sur un terrain) ou **une équipe** (demi-terrain, remplaçants à côté).

### Habillage

Sans toucher au code :
- **thème** : couleur d'accent, couleur du terrain, plaques claires ou sombres, arrondi, police ;
- **options** : barre de progression, blasons, abréviations, hachures, bandeau d'action et sa durée, retrait automatique des bandeaux, vitesse des animations, défilant en haut ;
- **positions et tailles** : chaque élément se glisse sur un écran 16:9 et se redimensionne par le coin, avec aimantation au centre et au cadre de sécurité.

Les paramètres `?pos`, `?taille` et `?accent` dans l'adresse d'un overlay restent possibles : ils se combinent avec l'habillage, et l'accent de l'adresse est prioritaire.

### Graphiques

Éditeur de graphiques sur mesure (sponsor, homme du match, prochain match…) : calques bloc, texte, image et hachures, posés à la souris sur l'écran 1920 × 1080. Les textes acceptent des champs en direct : `{home.name}`, `{away.score}`, `{clock}`, `{period}`, `{title}`, `{scorer}`… Les couleurs peuvent suivre le thème ou les équipes. Chaque graphique apparaît comme une tuile dans la barre du Studio et passe par l'aperçu comme les autres éléments. Jusqu'à 20 graphiques de 30 calques.

**Variables** : des textes qu'on change depuis le Studio sans rouvrir l'éditeur (nom du joueur, minute, horaire…). Dans l'éditeur, onglet « Variables », ou bouton « Rendre modifiable dans le Studio » sur un calque texte ; la variable s'écrit `{v.joueur}` dans le texte. Dans le Studio, la carte du graphique montre un champ par variable. Comme pour les autres éléments, le texte à l'antenne change au prochain « Prendre ». Jusqu'à 12 variables par graphique.

### Mode studio

- Chaque carte a un bouton **Préparer** (raccourcis `1` à `6`). **Prendre** (`Entrée`) envoie l'aperçu à l'antenne, avec une transition **animée** ou une **coupe** (instantanée).
- Le texte des compositions et des infos reste figé à l'antenne jusqu'au prochain « Prendre » : on peut préparer le bandeau suivant sans toucher à celui qui est diffusé. Le score reste toujours en direct.
- Le mode studio est activé par défaut. En mode direct (bouton en haut à droite), chaque bouton affiche ou masque l'élément immédiatement.
- Une carte dont le contenu est vide le signale (ex. « Aucun nom saisi : rien ne s'affichera »).
- `https://ton-site/overlay/?vue=apercu` affiche l'aperçu, par exemple sur un écran de retour.

### Animations

Signature UNI : trois plaques de couleur (accent, noir, couleur du bloc) balaient chaque élément en cascade à l'entrée et à la sortie, puis le contenu arrive par étapes. On retrouve aussi :
- des lettres animées une à une (« BUT ! », titres) ;
- des hachures animées et le blason de l'équipe dans le bandeau d'action ;
- la barre qui « bondit » et une onde autour de la pastille de l'équipe à chaque but ;
- un trait de progression de la période sous le scoreboard ;
- des chiffres qui comptent depuis zéro sur le carton de score, et un compte à rebours qui pulse dans les 10 dernières secondes.

Le bouton **À l'antenne / Hors antenne** de la régie fait entrer ou sortir l'overlay avec une animation : inutile de couper la source dans OBS.

## Écrans, replay et transitions

Dans le Studio, trois onglets de plus :

- **Écran plein** (touche `7`) : avant-match (compte à rebours jusqu'à l'heure de début), pause / mi-temps (score, buteurs, « reprise dans… »), fin du match, coupure (« Nous revenons dans un instant »). L'écran recouvre toute l'image, aux couleurs et logos des équipes.
- **Replay** (touche `8`) : cadre et bandeau « REPLAY » / « RALENTI » avec le score. Une transition plein écran se joue à l'entrée et à la sortie. Option : affichage automatique quand OBS enregistre un replay (tampon de relecture).
- **Transitions** : volet, rideau ou barres, aux couleurs des équipes. « ▶ Jouer » la lance sans changer de scène ; les boutons de scènes (noms écrits comme dans OBS) font changer OBS de scène pendant que l'écran est couvert. Elle se joue aussi quand tu changes de scène dans OBS (case à cocher).

Réglages dans OBS :

1. La source navigateur `overlay/` dans **chaque scène** (Copier, puis Coller (référence)), tout en haut.
2. Propriétés de la source › **Accès de la page** : « Accès avancé à OBS », pour que la régie puisse changer de scène.
3. Transitions de scènes : un **Stinger** avec `assets/stinger-vide.webm`, point de transition **450 ms**. La transition dure 1 s ; l'écran est entièrement couvert à 450 ms, la coupure tombe donc dessous.

## Karting (Apex Timing)

Choisir le sport **Karting** dans l'onglet Match › Sport et match. Un onglet **Course (karting)** remplace « Équipes et compositions » :

1. Coller le lien du live timing du circuit (`https://www.apex-timing.com/live-timing/<circuit>/index.html`) puis **Connecter** : le port du flux, le nom du circuit et ses tracés sont lus automatiquement. Choisir le tracé pour la mini map.
2. **Pilotes** : nom affiché et équipe par numéro de kart (en location, Apex n'affiche souvent que « KART 12 »).
3. **Mode démo** : une course simulée (sprint, endurance ou loisir), identique sur tous les écrans, pour tout régler sans session en direct.

Les temps ne passent pas par le serveur : chaque overlay et la régie se connectent directement au flux Apex (lecture seule, sans compte).

Dans le Studio, la console de score devient une **console de course** (classement en direct, ★ pour suivre un pilote, A / B pour le duel) et les tuiles deviennent :

| Élément | Contenu |
|---|---|
| Classement | colonne façon F1 : position, liseré à la couleur du kart, pilote en code 3 lettres, « L. MARTIN » ou nom complet (réglable), flèches de places gagnées / perdues, écart / intervalle (au meilleur tour hors course), PIT, meilleur tour en violet, dépassements animés ; le pilote suivi est surligné, ajouté en bas s'il est loin |
| Chrono de course | en haut à gauche, façon endurance : temps ou tours restants avec barre de progression, drapeau, meilleur tour |
| Mini map | tracé du circuit et un point par kart, position estimée d'après la durée prévue du tour, recalée à chaque passage de ligne et de secteur |
| Fiche pilote | position, dernier / meilleur tour, écarts avec les karts devant et derrière, arrêts (endurance) |
| Duel | deux pilotes, l'écart entre eux et s'il se réduit |
| Résultats | écran plein : podium et classement complet |

Quand le classement ou le bandeau course est à l'antenne, des bandeaux s'affichent tout seuls : meilleur tour, drapeau jaune, drapeau rouge, arrivée. Stream Deck : `a=kart&suivre=12`, `a=kart&duel=12,7`, et `a=element&nom=k-tower` (etc.).

## Accès distants

Onglet Match › **Accès distants** : un lien et un QR code par accès. « Nouveau lien » invalide l'ancien.

- **Panneau arbitre** (`arbitre/?cle=…`) : page pour téléphone avec les points du sport, −1, set gagné, chrono, période, mi-temps / fin, horloge des tirs, et « Annuler ». Sa clé ne peut rien changer à l'antenne.
- **Panneau client** (`saisie/?cle=…`, désactivé par défaut) : le club ou l'organisateur remplit les fiches (couleurs, logo, joueurs, photos). Chaque envoi arrive dans l'onglet Clubs, bloc **À valider**, avec la liste des changements : Accepter ou Refuser. Les images (PNG, JPEG, WebP, 3 Mo au plus) restent dans `uploads/attente/` jusqu'à la validation.

Pour un téléphone sur le même wifi, lancer le serveur sur toutes les interfaces : `php -S 0.0.0.0:8000`. Les liens affichés utilisent alors l'adresse de l'ordinateur sur le réseau.

## Twitch

Onglet Habillage › **Twitch** : nom de la chaîne, nombre de messages, effacement, filtres (commandes « ! », bots), alertes voulues et boutons de test. Connexion en lecture seule, sans compte.

- `overlay/twitch.html?mode=tchat` : le tchat (badges, emotes, messages supprimés par les modérateurs retirés).
- `overlay/twitch.html?mode=alertes` : abonnements, abonnements offerts, raids, bits, l'un après l'autre.
- `overlay/twitch.html` : les deux ; `overlay/?twitch` : tout, Twitch compris, dans une seule source.
- Graphiques : champs « Twitch : dernier abonné », « abonnés du jour », « dernier raid », « derniers bits ».

Les nouveaux followers et le nombre de spectateurs demandent de connecter un compte Twitch : pas encore disponibles.

## Régie

- Plusieurs personnes peuvent piloter le même match en même temps (par exemple une au score, une au chrono) : les modifications ne s'écrasent pas.
- Après une mise à jour du site, les pages déjà ouvertes (régie et overlays dans OBS) se rechargent toutes seules. Une page restée sur l'ancienne version ne peut plus rien enregistrer.
- Raccourcis clavier (Studio) : `1`…`8` éléments, `Entrée` Prendre, `Échap` tout masquer, `Espace` chrono, `A` / `Q` +/− équipe de gauche, `P` / `M` +/− équipe de droite, `R` / `T` horloge des tirs à 24 / 14 s, `Ctrl+Z` annuler.
- Le bandeau nom peut être rempli depuis les compositions (liste des joueurs). Le bandeau nom et le remplacement se retirent seuls de l'antenne après 8 s (case à décocher).
- Logos et photos : déposer l'image dans l'onglet Clubs. Un nom de fichier de `logos/` (`iut.png`) ou une adresse `https://…` marchent aussi.

## Stream Deck

`api/action.php` permet de piloter le match depuis un Stream Deck avec [Bitfocus Companion](https://bitfocus.io/companion) (module « Generic HTTP »), ou depuis n'importe quel outil qui envoie une requête web. La clé secrète se trouve dans l'onglet Match (section Stream Deck), avec la liste des adresses prêtes à copier. « Nouvelle clé » invalide l'ancienne.

```
https://ton-site/api/action.php?cle=<clé>&a=point&equipe=gauche
```

| Action | Paramètres | Effet |
|---|---|---|
| `point` | `equipe=gauche\|droite`, `type=0` (rang dans les points du sport) | ajoute des points |
| `moins` | `equipe=gauche\|droite`, `v=3` (facultatif) | retire un point (ou `v` points) |
| `chrono` | `etat=bascule\|marche\|arret` | démarre / arrête le chrono |
| `periode` | `n=suivante\|precedente\|<numéro>` | change de période |
| `statut` | `v=temps\|mi-temps\|fin\|pause` | texte à la place du chrono |
| `tirs` | `s=24` | horloge des tirs (basket) |
| `set` | `equipe=gauche\|droite`, `annule=1` | set gagné (volley) ; `annule=1` revient au set précédent |
| `element` | `nom=score\|equipes\|lower\|sub\|card\|ticker\|ecran\|replay\|g-<id>`, `etat=bascule\|on\|off` | prépare un élément (à l'antenne directement en mode direct) |
| `ecran` | `type=avant\|pause\|fin\|coupure` | choisit l'écran plein et le prépare |
| `transition` | `style=volet\|rideau\|barres`, `scene=<nom OBS>` | transition plein écran (et changement de scène OBS) |
| `prendre` | | envoie l'aperçu à l'antenne |
| `tout_masquer` | | retire tout |
| `etat` | | ne change rien |

La réponse (JSON) contient `score`, `gauche`, `droite`, `chrono`, `periode`, `marche` : de quoi afficher le score ou le chrono sur une touche (variables Companion). Les pages de la régie ouvertes voient la modification arriver en une seconde.

### Images de touche (score, logo)

`api/touche.php` renvoie une image PNG à afficher **sur** une touche (même clé que ci-dessus) :

```
https://ton-site/api/touche.php?cle=<clé>&v=score&equipe=gauche    score sur la couleur de l'équipe
https://ton-site/api/touche.php?cle=<clé>&v=logo&equipe=droite     logo de l'équipe (ou son abréviation)
```

Options : `&taille=72…288` (144 par défaut), `&format=texte` (juste le chiffre ou l'abréviation), `&format=json`. Dans Companion : module « Generic HTTP », retour (feedback) « Image from URL », rafraîchi toutes les secondes pour le score. Les logos SVG et les logos donnés par une adresse `https://` s'affichent sous forme d'abréviation. Il faut l'extension PHP GD (présente chez presque tous les hébergeurs) ; police Archivo Black dans `assets/fonts/` (licence OFL).

La clé arbitre est acceptée pour `point`, `moins`, `set`, `chrono`, `periode`, `statut`, `tirs` et `etat` seulement.

`api/` n'est pas protégé par le mot de passe de la régie : la clé suffit. La garder secrète, et utiliser HTTPS.

## Ajouter ou modifier un sport

Tout se règle dans `assets/sports.json`, que lisent à la fois la régie, les overlays et le serveur :

```jsonc
"hand": {
  "label": "Handball",
  "layout": "barre",              // style du scoreboard : barre, barre-gauche, empile, basket
  "clock": "up",                  // "up" (croissant), "down" (décroissant) ou false
  "added": false,                 // temps additionnel affichable (football)
  "cards": false,                 // cartons rouges (football)
  "fouls": false,                 // fautes d'équipe (basket)
  "shot": [24, 14],               // horloge des tirs (basket), sinon à retirer
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
