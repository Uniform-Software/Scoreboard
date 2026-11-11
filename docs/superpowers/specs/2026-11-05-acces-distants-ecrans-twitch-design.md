# Accès distants, écrans, transitions et Twitch — design

Date : 2026-11-05 · validé en conversation (« okk go »).

## Objectif

Étendre la régie OBS avec : un panneau arbitre (téléphone), un panneau de saisie client,
des écrans plein cadre (avant-match, pause, fin, coupure), un habillage replay, des transitions
générales déclenchées par OBS ou par la régie, et des overlays Twitch (tchat, alertes, variables).

## Accès sans mot de passe

- Pages hors de `admin/` (protégé par .htaccess) : `arbitre/` et `saisie/`, ouvertes avec `?cle=`.
- `data/cle.json` contient trois clés : `cle` (régie / Stream Deck, existante), `arbitre`, `client`.
  Le client peut être désactivé (clé vide). Chaque clé se régénère depuis la régie.
- Onglet Match › « Accès distants » (ancien « Stream Deck ») : liens, QR codes, régénération.

## Lot 1 — Arbitre

- `arbitre/index.html` : page mobile, gros boutons. Score +/− par type de point du sport,
  chrono marche/arrêt, période ±, statut (mi-temps, fin), tirs 24/14 (basket), set gagné (volley),
  annuler la dernière action.
- Passe par `api/action.php`. La clé arbitre n'autorise que : point, moins, chrono, periode,
  statut, tirs, set, etat. Jamais l'antenne.
- Wake Lock (écran allumé), vibration à chaque action, voyant de connexion.
- Ajout à l'API : `a=set equipe=…` (set gagné, comme la régie).

## Lot 2 — Écrans, replay, transitions

- Nouvel overlay `overlay/ecrans.html`, intégré à `overlay/index.html` (tout-en-un).
- Écrans : `avant` (compte à rebours vers une heure), `pause` (score, buteurs, reprise dans…),
  `fin` (score final, buteurs), `coupure` (message). Un seul écran à la fois ; élément d'antenne
  `ecran` + choix du type dans `infos.ecran`. Fond animé aux couleurs des équipes et du thème.
- Replay : élément d'antenne `replay` : volet d'entrée/sortie avec logo, bandeau « REPLAY » ou
  « RALENTI », cadre. Option : affichage auto N s sur l'évènement OBS `obsReplaybufferSaved`.
- Transitions : `antenne.wipe = {id, style, scene}` (évènement ponctuel). Styles : volet diagonal
  couleurs équipes, rideau logo, barres.
  - Depuis OBS : `obsSceneChanged` dans la source navigateur → l'animation se joue. On fournit
    `assets/stinger-vide.webm` (transparent) à mettre en transition Stinger, point de transition 450 ms.
  - Depuis la régie / Stream Deck (`a=transition&scene=…`) : l'overlay recouvre, appelle
    `obsstudio.setCurrentScene(scene)` (permission « contrôle avancé » de la source), puis découvre.
    Le changement de scène provoqué par l'overlay lui-même ne relance pas d'animation.
  - Noms des scènes saisis dans la régie (boutons « Cam 1 », « Cam 2 »…).

## Lot 3 — Saisie client (lien global)

- `saisie/index.html` : liste des clubs + nouveau club, même formulaire que la régie
  (couleurs, logo, joueurs, photos), bouton « Envoyer pour validation ».
- `api/saisie.php` (clé client) : GET clubs + sports ; POST une proposition par club dans
  `data/propositions.json` (hors liste FICHIERS : non lisible par lire.php).
- Envoi d'images dans `uploads/attente/`, limité en taille et en format.
- Régie › Clubs : onglet « À valider (n) » : différences (champs, joueurs ajoutés/retirés),
  Accepter / Refuser par club. Accepter déplace les images et fusionne dans clubs.json.

## Lot 4 — Twitch (sans compte)

- Réglage : nom de la chaîne (habillage).
- `overlay/twitch.html?vue=tchat` : IRC anonyme (wss://irc-ws.chat.twitch.tv), badges, emotes,
  filtres (commandes « ! », bots), nombre max de messages, effacement auto.
- `?vue=alertes` : sub, resub, sub offert, raid, bits — file d'attente, style maison.
- Variables dans les graphiques : `{twitch.dernierSub}`, `{twitch.dernierRaid}`,
  `{twitch.dernierBits}`, `{twitch.subsSession}` — chaque overlay se connecte lui-même
  (fonctionne régie fermée), valeurs gardées en localStorage.
- Plus tard (connexion de compte) : followers, nombre de spectateurs.

## Tests

Copie isolée du site (jamais le dossier `data/` de l'utilisateur), serveur PHP de test,
navigateur intégré : chaque page sans erreur console, chaque action vérifiée sur l'overlay.
