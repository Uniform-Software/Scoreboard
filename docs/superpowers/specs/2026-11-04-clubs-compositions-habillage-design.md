# Clubs, compositions sur terrain, habillage, graphiques, Stream Deck

Spécification validée en conversation le 4 novembre 2026.

## Objectif

Préparer un tournoi une fois (clubs, joueurs, photos), puis produire chaque match avec des compositions visuelles sur terrain, un habillage réglable sans toucher au code, des graphiques sur mesure et une commande à distance par Stream Deck.

## Données (dossier `data/`, mêmes règles que l'existant)

Versions, fusion des modifications concurrentes, vérification côté serveur dans `api/etat.php`.

- `clubs.json` : bibliothèque. `{ clubs: [ { id, name, code, color, color2, logo, sport, coach, players: [ { id, number, first, last, pos, photo, captain } ] } ] }`. Au plus 200 clubs, 60 joueurs par club.
- `equipes.json` : composition du match. `{ title, home: Lineup, away: Lineup }` avec `Lineup = { club, formation, starters: [playerId], subs: [playerId], slots: { slotId: playerId } }`. `slots` ne garde que les placements modifiés à la main.
- `score.json` : inchangé. À la sélection d'un club, l'identité (nom, abréviation, couleur, logo) y est recopiée, et mise à jour quand le club change dans la bibliothèque.
- `habillage.json` : thème, positions, options (détail plus bas).
- `graphiques.json` : graphiques personnalisés (détail plus bas).
- `antenne.json` : les graphiques personnalisés s'ajoutent aux éléments (`g:<id>`). Le contenu des graphiques est figé au programme comme celui des infos.

Migration : au premier lancement, les équipes déjà saisies (nom, couleurs, logo, joueurs en texte « 10 Nom ») deviennent deux clubs, et la composition y fait référence.

## Images

`admin/upload.php` (protégé par `admin/.htaccess`) : POST multipart, PNG / JPEG / WebP / SVG, 5 Mo maximum, type vérifié sur le contenu (pas l'extension), SVG nettoyé (pas de script, pas de gestionnaire d'événement, pas de lien externe), nom unique aléatoire, enregistré dans `uploads/`. `uploads/.htaccess` interdit l'exécution de scripts. Photos de joueurs recadrées en carré 400 × 400 dans le navigateur avant l'envoi ; logos réduits à 512 px au plus, proportions gardées.

## Onglet Clubs (`admin/clubs.html`)

Liste des clubs (recherche, filtre sport, nouveau, dupliquer, supprimer avec confirmation) et fiche : identité (nom, abréviation, couleur principale et secondaire, logo par glisser-déposer avec aperçu clair / sombre), sport, entraîneur, effectif (photo, numéro, prénom, nom, poste selon le sport, capitaine ; ordre modifiable ; « Coller une liste » d'une ligne par joueur « 10 Kylian Mbappé ATT »).

## Compositions sur terrain

- `sports.json` reçoit pour chaque sport : `positions` (postes proposés) et `formations` (`{ id, label, slots: [ { id, x, y, role } ] }`, x et y en pourcentage du demi-terrain, l'équipe attaquant vers le haut). Football : 4-4-2, 4-3-3, 4-2-3-1, 4-3-1-2, 4-1-4-1, 3-5-2, 3-4-3, 5-3-2. Rugby XV : 1 à 15. Handball : 3-3 + gardien. Basket : 5 postes. Volley : 6 postes de rotation + libéro à part.
- Placement automatique, pour chaque poste dans l'ordre : joueur dont le poste habituel correspond au rôle du poste, puis numéro d'usage (table par sport), puis titulaires restants. Les placements manuels (`slots`) passent avant.
- Onglet Match : choix des deux clubs, de la formation, des titulaires et remplaçants (cases à cocher sur l'effectif), petit terrain cliquable pour échanger un joueur de poste.
- Overlay `equipes.html`, deux dispositions (choix dans la carte Compositions du Studio) : « Face à face » (terrain entier, une équipe par moitié, bandes remplaçants + entraîneur) et « Une équipe » (grand demi-terrain, banc et entraîneur à côté, carte qui permet de choisir l'équipe).
- Pion joueur : photo ronde cerclée de la couleur d'équipe, numéro en pastille, nom court ; sans photo, silhouette plate à la couleur de l'équipe avec le numéro ; « C » pour le capitaine. Animation : tracé du terrain, puis les joueurs ligne par ligne, puis le banc.

## Onglet Habillage (`admin/habillage.html`)

- Thème : accent, couleur secondaire, plaques claires ou sombres, arrondi 0–24 px, police (Archivo, Barlow, Inter, Oswald, Bebas Neue).
- Positions et tailles : canevas 16:9 avec image de test ; chaque élément (scoreboard, bandeau nom, remplacement, défilant, carton, compositions, graphiques) se déplace et se redimensionne à la souris, guides magnétiques et zone de sécurité ; valeurs X / Y / taille ; réinitialiser par élément ou tout.
- Options : barre de progression, blasons dans le scoreboard, abréviations (déplacée depuis Match), hachures, bandeau d'action (activé, durée), durée avant retrait du bandeau nom et du remplacement, vitesse des animations (lente / normale / rapide).
- Appliqué en direct aux overlays (programme et aperçu), sans « Prendre ». Les paramètres d'adresse (`?pos=`, `?taille=`, `?accent=`) restent prioritaires s'ils sont présents.

## Générateur de graphiques (onglet Graphiques)

Note d'implémentation : placé dans un onglet à part (`admin/graphiques.html`) plutôt que dans Habillage, pour garder chaque page lisible.

- Graphique = calques sur 1920 × 1080 : bloc (couleur, arrondi), texte (police, taille, graisse, couleur, alignement, champs en direct : nom / abréviation / score des équipes, chrono, période, compétition, dernier marqueur), image (envoyée ou logo d'équipe), hachures.
- Éditeur : glisser, redimensionner, aligner ; liste des calques (ordre, masquer, dupliquer, supprimer) ; animation d'entrée / sortie (plaques UNI, glissé, fondu, aucune) avec apparition des calques dans l'ordre.
- Modèles : logo sponsor en coin, homme du match, score + chrono minimal, prochain match.
- Overlay `overlay/graphiques.html`, inclus dans `overlay/`. Chaque graphique apparaît comme une tuile dans la barre du Studio.
- Limites : 20 graphiques, 30 calques chacun.

## Stream Deck (`api/action.php`)

- Clé secrète générée et affichée dans l'onglet Match (régénérable), enregistrée dans `data/cle.json`. Toute action sans la bonne clé est refusée (403). Les requêtes acceptent GET (Companion « Generic HTTP » ou plugin de requêtes web).
- Actions appliquées côté serveur, avec le même verrou que les écritures : `point` (équipe, type de point), `moins` (équipe), `chrono` (démarrer / arrêter), `periode` (suivante / numéro), `statut` (mi-temps, fin, temps de jeu), `tirs` (24 / 14), `element` (préparer ou afficher un élément), `prendre`, `tout_masquer`.
- Réponse JSON courte (`ok`, score, chrono) que Companion peut afficher sur la touche.
- Liste des boutons prête à copier dans l'onglet Match, et section du README.

## Ordre de réalisation

1. Clubs + envoi d'images (+ migration).
2. Compositions sur terrain (sports.json, Match, overlay).
3. Habillage (thème, positions, options).
4. Générateur de graphiques.
5. API Stream Deck.

Chaque étape est testée sur une copie isolée du projet (jamais sur `data/` de l'utilisateur) avant de passer à la suivante.
