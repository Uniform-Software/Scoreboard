<?php
// etat.php : fonctions communes, incluses par api/lire.php et admin/ecrire.php.
// Ce fichier n'affiche rien s'il est ouvert directement.
//
// Chaque fichier de données (data/score.json, equipes.json, infos.json, antenne.json, clubs.json, habillage.json,
// graphiques.json) contient :
//   { "rev": 12, "state": { ... } }
// "rev" augmente de 1 à chaque écriture : il permet de détecter qu'une autre
// page de contrôle a modifié les données entre-temps (voir ecrire_etat).

// Les avertissements PHP ne doivent jamais s'afficher dans les réponses : ils casseraient le JSON
// lu par la régie (PHP 8.5 en signale beaucoup). Ils restent dans le journal du serveur.
ini_set('display_errors', '0');

const FICHIERS = ['score', 'equipes', 'infos', 'antenne', 'clubs', 'habillage', 'graphiques', 'karting'];

function dossier_data() {
    return dirname(__DIR__) . '/data';
}

// ---------- Réponses ----------

function repondre($code, $donnees) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    // L'heure du serveur sert à synchroniser le chrono entre les appareils.
    $donnees['serverTime'] = (int) round(microtime(true) * 1000);
    $donnees['version'] = version_code();
    echo json_encode($donnees, JSON_UNESCAPED_UNICODE);
    exit;
}

// Version du code : date de la dernière modification des pages, scripts et styles.
// Quand elle change (mise à jour du site), les pages ouvertes se rechargent toutes seules.
function version_code() {
    $racine = dirname(__DIR__);
    $fichiers = array_merge(glob("$racine/assets/*") ?: [], glob("$racine/admin/*.html") ?: [], glob("$racine/overlay/*.html") ?: [],
        glob("$racine/arbitre/*.html") ?: [], glob("$racine/saisie/*.html") ?: []);
    return $fichiers ? max(array_map('filemtime', $fichiers)) : 0;
}

function echec($code, $message) {
    repondre($code, ['ok' => false, 'error' => $message]);
}

// ---------- Lecture / écriture ----------

function chemin_fichier($f) {
    if (!in_array($f, FICHIERS, true)) {
        echec(400, 'Fichier inconnu');
    }
    return dossier_data() . '/' . $f . '.json';
}

function lire_etat($f) {
    $chemin = chemin_fichier($f);
    $contenu = is_file($chemin) ? json_decode(file_get_contents($chemin), true) : null;
    if (!is_array($contenu) || !isset($contenu['rev'])) {
        return ['rev' => 0, 'state' => null];
    }
    return ['rev' => (int) $contenu['rev'], 'state' => $contenu['state'] ?? null];
}

// Écrit le nouvel état, seulement si la page qui l'envoie partait bien de la dernière version.
// Sinon on répond 409 avec la version actuelle : la page rejoue ses modifications dessus.
// $conflit_fatal = false (API Stream Deck) : en cas de conflit, renvoie null au lieu de répondre 409.
function ecrire_etat($f, $rev_client, $etat_brut, $conflit_fatal = true) {
    $chemin = chemin_fichier($f); // vérifie aussi que $f est un nom autorisé
    $dossier = dossier_data();
    if (!is_dir($dossier) && !@mkdir($dossier, 0775, true)) {
        echec(500, 'Dossier data/ introuvable');
    }

    // Un seul envoi traité à la fois (verrou), pour ne jamais perdre une modification.
    $verrou = @fopen($dossier . '/' . $f . '.lock', 'c');
    if (!$verrou || !flock($verrou, LOCK_EX)) {
        echec(500, 'Écriture impossible : vérifie que le dossier data/ est accessible en écriture');
    }

    $actuel = lire_etat($f);
    if ($rev_client !== $actuel['rev']) {
        flock($verrou, LOCK_UN);
        if (!$conflit_fatal) {
            return null;
        }
        repondre(409, ['ok' => false, 'error' => 'Conflit'] + $actuel);
    }

    $nouveau = [
        'rev'   => $actuel['rev'] + 1,
        'state' => call_user_func('nettoyer_' . $f, $etat_brut),
    ];

    // Fichier temporaire puis renommage : un lecteur ne voit jamais un fichier à moitié écrit.
    $temporaire = $chemin . '.tmp';
    $ok = file_put_contents($temporaire, json_encode($nouveau, JSON_UNESCAPED_UNICODE)) !== false
        && rename($temporaire, $chemin);
    flock($verrou, LOCK_UN);
    if (!$ok) {
        echec(500, 'Écriture impossible : vérifie que le dossier data/ est accessible en écriture');
    }
    return $nouveau;
}

// Clés secrètes des accès distants (data/cle.json, gérées depuis l'onglet Match › Accès distants) :
//   cle     : régie complète (Stream Deck, api/action.php)
//   arbitre : panneau arbitre (score et chrono uniquement)
//   client  : panneau de saisie des clubs (vide = désactivé)
const ROLES = ['cle', 'arbitre', 'client'];

function cles() {
    $c = json_decode((string) @file_get_contents(dossier_data() . '/cle.json'), true);
    $sortie = [];
    foreach (ROLES as $r) {
        $v = is_array($c) ? ($c[$r] ?? '') : '';
        $sortie[$r] = (is_string($v) && strlen($v) >= 16) ? $v : '';
    }
    return $sortie;
}

function cle_api() {
    return cles()['cle'];
}

// Rôle correspondant à la clé reçue (?cle=…), ou '' si elle ne correspond à aucun.
function role_de($recue) {
    $recue = (string) $recue;
    foreach (cles() as $role => $cle) {
        if ($cle !== '' && hash_equals($cle, $recue)) return $role;
    }
    return '';
}

// ---------- Vérification des valeurs ----------
// On ne stocke jamais les données reçues telles quelles : on reconstruit un état propre.

function entier($valeur, $min, $max) {
    return max($min, min($max, (int) $valeur));
}

function texte($valeur, $max) {
    $valeur = is_string($valeur) ? $valeur : '';
    // Retire retours à la ligne et caractères de contrôle (et rejette un texte qui n'est pas de l'UTF-8 valide).
    $valeur = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $valeur) ?? '');
    return function_exists('mb_substr') ? mb_substr($valeur, 0, $max) : substr($valeur, 0, $max);
}

function couleur($valeur, $defaut = '#888888') {
    return (is_string($valeur) && preg_match('/^#[0-9a-fA-F]{6}$/', $valeur)) ? strtolower($valeur) : $defaut;
}

// Identifiant court (club, joueur) : lettres minuscules et chiffres
function ident($valeur) {
    return (is_string($valeur) && preg_match('/^[a-z0-9]{1,16}$/', $valeur)) ? $valeur : '';
}

function cote($valeur) {
    return in_array($valeur, ['home', 'away'], true) ? $valeur : '';
}

// Image (logo, photo) : une image envoyée depuis la régie (uploads/…), le nom d'une image
// du dossier logos/ (ex. iut.png), ou une adresse https complète.
// $attente : accepte aussi les images envoyées par le panneau client, pas encore validées (uploads/attente/…).
function logo($valeur, $attente = false) {
    $valeur = is_string($valeur) ? trim($valeur) : '';
    if (strlen($valeur) > 300 || !preg_match('/\.(png|jpe?g|gif|webp|svg)$/i', $valeur)) {
        return '';
    }
    if (preg_match('#^uploads/[a-f0-9]{24}\.(png|jpg|webp|svg)$#', $valeur)) {
        return $valeur;
    }
    if (preg_match('#^uploads/attente/[a-f0-9]{24}\.(png|jpg|webp)$#', $valeur)) {
        return $attente ? $valeur : '';
    }
    if (preg_match('#^[A-Za-z0-9_\-.]+$#', $valeur) && strpos($valeur, '..') === false) {
        return $valeur;
    }
    if (preg_match('#^https://[A-Za-z0-9.\-]+(:[0-9]+)?/[A-Za-z0-9_\-./%]+$#', $valeur)) {
        return $valeur;
    }
    return '';
}

// Liste de textes (ex. une ligne = un joueur), lignes vides ignorées.
function lignes($valeur, $max_lignes, $max_longueur = 40) {
    $sortie = [];
    foreach ((is_array($valeur) ? $valeur : []) as $ligne) {
        $t = texte($ligne, $max_longueur);
        if ($t !== '') {
            $sortie[] = $t;
        }
        if (count($sortie) >= $max_lignes) {
            break;
        }
    }
    return $sortie;
}

function sports() {
    $sports = json_decode(@file_get_contents(dirname(__DIR__) . '/assets/sports.json'), true);
    if (!is_array($sports) || !$sports) {
        echec(500, 'assets/sports.json illisible');
    }
    return $sports;
}

// ---------- Les deux types de données ----------

function nettoyer_score($e) {
    $sports = sports();
    $sport = (is_string($e['sport'] ?? null) && isset($sports[$e['sport']])) ? $e['sport'] : array_keys($sports)[0];
    $nb_periodes = count($sports[$sport]['periods'] ?? []);
    $chrono = is_array($e['clock'] ?? null) ? $e['clock'] : [];
    $evenement = is_array($e['event'] ?? null) ? $e['event'] : [];

    $equipe = function ($t) {
        $t = is_array($t) ? $t : [];
        return [
            'name'  => texte($t['name'] ?? '', 24),
            'code'  => texte($t['code'] ?? '', 4),        // abréviation (PSG, OM…)
            'color' => couleur($t['color'] ?? ''),
            'logo'  => logo($t['logo'] ?? ''),
            'score' => entier($t['score'] ?? 0, 0, 999),
            'sets'  => entier($t['sets'] ?? 0, 0, 9),
            'fouls' => entier($t['fouls'] ?? 0, 0, 20),   // fautes d'équipe (basket)
            'cards' => entier($t['cards'] ?? 0, 0, 5),    // cartons rouges (football)
        ];
    };

    // Scores des sets déjà joués (volley) : [[25, 20], [22, 25], ...]
    $historique = [];
    foreach ((is_array($e['history'] ?? null) ? $e['history'] : []) as $set) {
        if (is_array($set) && count($historique) < 5) {
            $historique[] = [entier($set[0] ?? 0, 0, 99), entier($set[1] ?? 0, 0, 99)];
        }
    }
    $tirs = is_array($e['shot'] ?? null) ? $e['shot'] : [];

    // Marqueurs : [{ team, player, minute, label }, ...]
    $marqueurs = [];
    foreach ((is_array($e['scorers'] ?? null) ? $e['scorers'] : []) as $m) {
        if (is_array($m) && cote($m['team'] ?? '') && count($marqueurs) < 40) {
            $marqueurs[] = [
                'team'   => cote($m['team']),
                'player' => texte($m['player'] ?? '', 40),
                'minute' => texte($m['minute'] ?? '', 8),
                'label'  => texte($m['label'] ?? '', 24),
            ];
        }
    }

    // Exclusions temporaires (carton jaune au rugby, 2 min au handball) :
    // endMs = valeur du chrono de jeu à laquelle l'exclusion se termine
    $exclusions = [];
    foreach ((is_array($e['sinbins'] ?? null) ? $e['sinbins'] : []) as $x) {
        if (is_array($x) && cote($x['team'] ?? '') && count($exclusions) < 10) {
            $exclusions[] = [
                'id'     => entier($x['id'] ?? 0, 0, 2000000000),
                'team'   => cote($x['team']),
                'player' => texte($x['player'] ?? '', 40),
                'endMs'  => entier($x['endMs'] ?? 0, 0, 36000000),
            ];
        }
    }

    return [
        'sport'   => $sport,
        'home'    => $equipe($e['home'] ?? null),
        'away'    => $equipe($e['away'] ?? null),
        'period'  => entier($e['period'] ?? 0, 0, max(0, $nb_periodes - 1)),
        'clock'   => [
            'running'   => !empty($chrono['running']),
            'baseMs'    => entier($chrono['baseMs'] ?? 0, 0, 36000000),
            'startedAt' => entier($chrono['startedAt'] ?? 0, 0, 99999999999999),
        ],
        // Horloge des tirs (basket) : défile en même temps que le chrono de jeu
        'shot'    => [
            'baseMs'    => entier($tirs['baseMs'] ?? 0, 0, 60000),
            'startedAt' => entier($tirs['startedAt'] ?? 0, 0, 99999999999999),
        ],
        'history' => $historique,
        'scorers' => $marqueurs,
        'sinbins' => $exclusions,
        'compact' => !empty($e['compact']),             // abréviations au lieu des noms complets
        // Texte affiché à la place du chrono : mi-temps, fin…
        'status'  => in_array($e['status'] ?? '', ['ht', 'ft', 'pause'], true) ? $e['status'] : '',
        'added'   => entier($e['added'] ?? 0, 0, 30),
        'serve'   => cote($e['serve'] ?? ''),
        // Dernière action de score : sert à déclencher le bandeau animé ("BUT !") sur l'affichage.
        'event'   => [
            'id'    => entier($evenement['id'] ?? 0, 0, 2000000000),
            'team'  => cote($evenement['team'] ?? ''),
            'label'  => texte($evenement['label'] ?? '', 24),
            'player' => texte($evenement['player'] ?? '', 40),
            'minute' => texte($evenement['minute'] ?? '', 8),
        ],
    ];
}

// Composition du match : pour chaque côté, le club choisi dans la bibliothèque, la formation,
// les titulaires et remplaçants (identifiants des joueurs) et les placements faits à la main.
function nettoyer_equipes($e) {
    $liste = function ($v, $max) {
        $sortie = [];
        foreach ((is_array($v) ? $v : []) as $x) {
            if (ident($x) && !in_array($x, $sortie, true) && count($sortie) < $max) {
                $sortie[] = $x;
            }
        }
        return $sortie;
    };
    $code = function ($v) {
        return (is_string($v) && preg_match('/^[a-z0-9]{1,8}$/', $v)) ? $v : '';
    };
    $compo = function ($t) use ($liste, $code) {
        $t = is_array($t) ? $t : [];
        $places = [];
        foreach ((is_array($t['slots'] ?? null) ? $t['slots'] : []) as $poste => $joueur) {
            if ($code((string) $poste) && ident($joueur) && count($places) < 20) {
                $places[(string) $poste] = $joueur;
            }
        }
        return [
            'club'      => ident($t['club'] ?? ''),
            'formation' => $code($t['formation'] ?? ''),
            'starters'  => $liste($t['starters'] ?? null, 20),
            'subs'      => $liste($t['subs'] ?? null, 30),
            'slots'     => (object) $places,            // {} et non [] quand c'est vide
        ];
    };

    return [
        'title'  => texte($e['title'] ?? '', 60),
        'layout' => ($e['layout'] ?? '') === 'une' ? 'une' : 'face',   // face à face, ou une seule équipe
        'focus'  => cote($e['focus'] ?? '') ?: 'home',                  // équipe montrée en disposition « une »
        'home'   => $compo($e['home'] ?? null),
        'away'   => $compo($e['away'] ?? null),
    ];
}

// Bibliothèque des clubs : identité, sport, entraîneur et effectif (avec photos).
function nettoyer_clubs($e, $attente = false) {
    $sports = sports();
    $clubs = [];
    $vus = [];
    foreach ((is_array($e['clubs'] ?? null) ? $e['clubs'] : []) as $c) {
        $id = is_array($c) ? ident($c['id'] ?? '') : '';
        if (!$id || isset($vus[$id]) || count($clubs) >= 200) {
            continue;
        }
        $vus[$id] = true;
        $sport = (is_string($c['sport'] ?? null) && isset($sports[$c['sport']])) ? $c['sport'] : array_keys($sports)[0];
        $postes = array_column($sports[$sport]['positions'] ?? [], 'id');

        $joueurs = [];
        $ids = [];
        foreach ((is_array($c['players'] ?? null) ? $c['players'] : []) as $j) {
            $jid = is_array($j) ? ident($j['id'] ?? '') : '';
            if (!$jid || isset($ids[$jid]) || count($joueurs) >= 60) {
                continue;
            }
            $ids[$jid] = true;
            $numero = is_scalar($j['number'] ?? null) ? (string) $j['number'] : '';
            $joueurs[] = [
                'id'      => $jid,
                'number'  => preg_match('/^\d{1,3}$/', $numero) ? $numero : '',
                'first'   => texte($j['first'] ?? '', 30),
                'last'    => texte($j['last'] ?? '', 30),
                'pos'     => in_array($j['pos'] ?? '', $postes, true) ? $j['pos'] : '',
                'photo'   => logo($j['photo'] ?? '', $attente),
                'captain' => !empty($j['captain']),
            ];
        }

        $clubs[] = [
            'id'      => $id,
            'name'    => texte($c['name'] ?? '', 24),
            'code'    => texte($c['code'] ?? '', 4),
            'color'   => couleur($c['color'] ?? ''),
            'color2'  => couleur($c['color2'] ?? '', '#ffffff'),
            'logo'    => logo($c['logo'] ?? '', $attente),
            'sport'   => $sport,
            'coach'   => texte($c['coach'] ?? '', 40),
            'players' => $joueurs,
        ];
    }
    return ['clubs' => $clubs];
}

// Overlay d'infos : bandeau nom, remplacement, carton central, bandeau défilant.
function nettoyer_infos($e) {
    $bloc = function ($cle) use ($e) {
        return is_array($e[$cle] ?? null) ? $e[$cle] : [];
    };
    $lower = $bloc('lower');
    $sub = $bloc('sub');
    $card = $bloc('card');
    $ticker = $bloc('ticker');
    $ecran = $bloc('ecran');
    $replay = $bloc('replay');
    $h = function ($v) { return is_string($v) && preg_match('/^([01][0-9]|2[0-3]):[0-5][0-9]$/', $v) ? $v : ''; };
    $heure = $h($card['time'] ?? null);

    return [
        'lower'  => [
            'title'    => texte($lower['title'] ?? '', 40),
            'subtitle' => texte($lower['subtitle'] ?? '', 60),
            'team'     => cote($lower['team'] ?? ''),
        ],
        'sub'    => [
            'team'    => cote($sub['team'] ?? '') ?: 'home',
            'in'      => texte($sub['in'] ?? '', 40),
            'out'     => texte($sub['out'] ?? '', 40),
        ],
        'card'   => [
            'mode'    => in_array($card['mode'] ?? '', ['score', 'message', 'countdown'], true) ? $card['mode'] : 'score',
            'title'   => texte($card['title'] ?? '', 40),
            'text'    => texte($card['text'] ?? '', 120),
            'time'    => $heure,
        ],
        'ticker' => [
            'label'   => texte($ticker['label'] ?? '', 20),
            'items'   => lignes($ticker['items'] ?? null, 20, 140),
        ],
        // Écran plein cadre : avant-match, pause / mi-temps, fin, coupure
        'ecran'  => [
            'type'    => in_array($ecran['type'] ?? '', ['avant', 'pause', 'fin', 'coupure'], true) ? $ecran['type'] : 'avant',
            'title'   => texte($ecran['title'] ?? '', 40),
            'text'    => texte($ecran['text'] ?? '', 120),
            'time'    => $h($ecran['time'] ?? null),
        ],
        // Habillage replay : bandeau, et affichage automatique quand OBS enregistre un replay
        'replay' => [
            'label'   => texte($replay['label'] ?? '', 20),
            'auto'    => !empty($replay['auto']),
            'sec'     => entier($replay['sec'] ?? 8, 3, 60),
        ],
    ];
}

// Antenne : ce qui est affiché au programme (à l'antenne) et à l'aperçu (mode studio).
// En mode studio, « snap » garde le contenu des compositions et des infos tel qu'il était
// au dernier « Prendre » : on peut les modifier à l'aperçu sans toucher à l'antenne.
const ELEMENTS_ANTENNE = ['score', 'equipes', 'lower', 'sub', 'card', 'ticker', 'ecran', 'replay',
    'k-tower', 'k-bar', 'k-map', 'k-driver', 'k-duel', 'k-results'];   // k- : karting
const STYLES_TRANSITION = ['volet', 'rideau', 'barres'];

function nettoyer_antenne($e) {
    $elements = ELEMENTS_ANTENNE;
    $affiches = function ($v) use ($elements) {
        $v = is_array($v) ? $v : [];
        $sortie = [];
        foreach ($elements as $cle) {
            $sortie[$cle] = !empty($v[$cle]);
        }
        // graphiques personnalisés : g-<identifiant>
        foreach ($v as $cle => $on) {
            if (preg_match('/^g-[a-z0-9]{1,16}$/', (string) $cle) && count($sortie) < 40) {
                $sortie[$cle] = !empty($on);
            }
        }
        return $sortie;
    };
    $snap = is_array($e['snap'] ?? null) ? $e['snap'] : [];
    $auto = is_array($e['auto'] ?? null) ? $e['auto'] : [];
    $wipe = is_array($e['wipe'] ?? null) ? $e['wipe'] : [];
    $style = function ($v) { return in_array($v, STYLES_TRANSITION, true) ? $v : STYLES_TRANSITION[0]; };

    return [
        'studio'     => !empty($e['studio']),
        'transition' => ($e['transition'] ?? '') === 'cut' ? 'cut' : 'anim',
        'program'    => $affiches($e['program'] ?? null),
        'preview'    => $affiches($e['preview'] ?? null),
        'take'       => entier($e['take'] ?? 0, 0, 2000000000),
        // Masquage automatique après 8 s (bandeau nom, remplacement)
        'auto'       => ['lower' => !empty($auto['lower']), 'sub' => !empty($auto['sub'])],
        // Transition plein écran : évènement ponctuel (id augmente à chaque lancement),
        // avec éventuellement la scène OBS à afficher pendant que l'écran est couvert.
        'wipe'       => [
            'id'    => entier($wipe['id'] ?? 0, 0, 2000000000),
            'style' => $style($wipe['style'] ?? ''),
            'scene' => texte($wipe['scene'] ?? '', 60),
        ],
        'wipeStyle'  => $style($e['wipeStyle'] ?? ''),
        'wipeObs'    => !array_key_exists('wipeObs', $e) || !empty($e['wipeObs']),   // aussi quand OBS change de scène
        'scenes'     => lignes($e['scenes'] ?? null, 12, 60),                          // noms des scènes OBS (boutons)
        'snap'       => [
            'equipes' => is_array($snap['equipes'] ?? null) ? nettoyer_equipes($snap['equipes']) : null,
            'infos'   => is_array($snap['infos'] ?? null) ? nettoyer_infos($snap['infos']) : null,
            'graphiques' => is_array($snap['graphiques'] ?? null) ? nettoyer_graphiques($snap['graphiques']) : null,
        ],
    ];
}

// Habillage des overlays : thème, position et taille de chaque élément, options d'affichage.
const POLICES = ['Archivo', 'Barlow Condensed', 'Inter', 'Oswald', 'Bebas Neue'];
const ELEMENTS_PLACABLES = ['score', 'lower', 'sub', 'card', 'ticker', 'equipes'];

function nettoyer_habillage($e) {
    $theme = is_array($e['theme'] ?? null) ? $e['theme'] : [];
    $options = is_array($e['options'] ?? null) ? $e['options'] : [];
    $places = is_array($e['layout'] ?? null) ? $e['layout'] : [];
    $tw = is_array($e['twitch'] ?? null) ? $e['twitch'] : [];
    $alertes = is_array($tw['alerts'] ?? null) ? $tw['alerts'] : [];
    $test = is_array($tw['test'] ?? null) ? $tw['test'] : [];
    $oui = function ($v, $k) { return !array_key_exists($k, $v) || !empty($v[$k]); };   // activé par défaut
    $decimal = function ($v, $min, $max, $defaut) {
        return is_numeric($v) ? round(max($min, min($max, (float) $v)), 2) : $defaut;
    };

    $layout = [];
    foreach (ELEMENTS_PLACABLES as $cle) {
        $l = is_array($places[$cle] ?? null) ? $places[$cle] : [];
        $layout[$cle] = [
            'dx' => entier($l['dx'] ?? 0, -1920, 1920),
            'dy' => entier($l['dy'] ?? 0, -1080, 1080),
            's'  => $decimal($l['s'] ?? 1, 0.4, 2.5, 1),
        ];
    }

    return [
        'theme'   => [
            'accent' => couleur($theme['accent'] ?? '', '#2448ff'),
            'plates' => ($theme['plates'] ?? '') === 'dark' ? 'dark' : 'light',
            'radius' => entier($theme['radius'] ?? 12, 0, 24),
            'font'   => in_array($theme['font'] ?? '', POLICES, true) ? $theme['font'] : 'Archivo',
            'pitch'  => couleur($theme['pitch'] ?? '', '#123a2b'),
        ],
        'layout'  => $layout,
        'options' => [
            'progress'    => !array_key_exists('progress', $options) || !empty($options['progress']),
            'crests'      => !array_key_exists('crests', $options) || !empty($options['crests']),
            'hatch'       => !array_key_exists('hatch', $options) || !empty($options['hatch']),
            'banner'      => !array_key_exists('banner', $options) || !empty($options['banner']),
            'bannerSec'   => $decimal($options['bannerSec'] ?? 5.5, 2, 15, 5.5),
            'autoHideSec' => entier($options['autoHideSec'] ?? 8, 3, 60),
            'speed'       => in_array($options['speed'] ?? '', ['slow', 'fast'], true) ? $options['speed'] : 'normal',
            'tickerTop'   => !empty($options['tickerTop']),
        ],
        // Twitch (overlay/twitch.html et variables {twitch.…}) : connexion anonyme au tchat de la chaîne
        'twitch'  => [
            'channel' => preg_match('/^[a-z0-9_]{1,25}$/', strtolower((string) ($tw['channel'] ?? ''))) ? strtolower($tw['channel']) : '',
            'max'     => entier($tw['max'] ?? 8, 2, 20),
            'fade'    => entier($tw['fade'] ?? 0, 0, 300),           // secondes avant effacement (0 : jamais)
            'hideCmd' => $oui($tw, 'hideCmd'),
            'bots'    => texte($tw['bots'] ?? 'nightbot, streamelements, streamlabs, moobot, fossabot, wizebot', 300),
            'minBits' => entier($tw['minBits'] ?? 1, 1, 100000),
            'alerts'  => ['sub' => $oui($alertes, 'sub'), 'gift' => $oui($alertes, 'gift'), 'raid' => $oui($alertes, 'raid'), 'bits' => $oui($alertes, 'bits')],
            // alerte de test lancée depuis l'Habillage
            'test'    => ['id' => entier($test['id'] ?? 0, 0, 2000000000), 'type' => in_array($test['type'] ?? '', ['sub', 'gift', 'raid', 'bits', 'chat'], true) ? $test['type'] : 'sub'],
        ],
    ];
}

// Graphiques personnalisés : calques (bloc, texte, image, hachures) placés sur l'écran 1920 × 1080.
const COULEURS_THEME = ['accent', 'ink', 'paper', 'home', 'away', 'home2', 'away2'];

function nettoyer_graphiques($e) {
    $couleur = function ($v, $defaut) {
        return in_array($v, COULEURS_THEME, true) ? $v : couleur($v, $defaut);
    };
    $choix = function ($v, $liste) {
        return in_array($v, $liste, true) ? $v : $liste[0];
    };
    $items = [];
    $vus = [];
    foreach ((is_array($e['items'] ?? null) ? $e['items'] : []) as $g) {
        $id = is_array($g) ? ident($g['id'] ?? '') : '';
        if (!$id || isset($vus[$id]) || count($items) >= 20) {
            continue;
        }
        $vus[$id] = true;
        $calques = [];
        $ids = [];
        foreach ((is_array($g['layers'] ?? null) ? $g['layers'] : []) as $c) {
            $cid = is_array($c) ? ident($c['id'] ?? '') : '';
            if (!$cid || isset($ids[$cid]) || count($calques) >= 30) {
                continue;
            }
            $ids[$cid] = true;
            $src = $c['src'] ?? '';
            $calques[] = [
                'id'      => $cid,
                'type'    => $choix($c['type'] ?? '', ['block', 'text', 'image', 'hatch']),
                'x'       => entier($c['x'] ?? 0, -1920, 3840),
                'y'       => entier($c['y'] ?? 0, -1080, 2160),
                'w'       => entier($c['w'] ?? 200, 1, 3840),
                'h'       => entier($c['h'] ?? 100, 1, 2160),
                'color'   => $couleur($c['color'] ?? '', 'accent'),
                'radius'  => entier($c['radius'] ?? 0, 0, 500),
                'opacity' => is_numeric($c['opacity'] ?? null) ? round(max(0, min(1, (float) $c['opacity'])), 2) : 1,
                'hidden'  => !empty($c['hidden']),
                'text'    => texte($c['text'] ?? '', 200),
                'size'    => entier($c['size'] ?? 40, 8, 400),
                'weight'  => (int) (round(entier($c['weight'] ?? 800, 100, 900) / 100) * 100),
                'stretch' => $choix($c['stretch'] ?? '', ['normal', 'cond', 'wide']),
                'align'   => $choix($c['align'] ?? '', ['left', 'center', 'right']),
                'upper'   => !array_key_exists('upper', $c) || !empty($c['upper']),
                'src'     => in_array($src, ['home.logo', 'away.logo'], true) ? $src : logo($src),
                'fit'     => $choix($c['fit'] ?? '', ['contain', 'cover']),
            ];
        }
        // Variables : textes modifiables depuis le Studio, insérés dans les calques sous la forme {v.<id>}
        $vars = [];
        $vids = [];
        foreach ((is_array($g['vars'] ?? null) ? $g['vars'] : []) as $v) {
            $vid = is_array($v) ? ident($v['id'] ?? '') : '';
            if (!$vid || isset($vids[$vid]) || count($vars) >= 12) {
                continue;
            }
            $vids[$vid] = true;
            $vars[] = [
                'id'    => $vid,
                'label' => texte($v['label'] ?? '', 24),
                'value' => texte($v['value'] ?? '', 120),
            ];
        }
        $items[] = [
            'id'     => $id,
            'name'   => texte($g['name'] ?? '', 40),
            'anim'   => $choix($g['anim'] ?? '', ['slabs', 'slide', 'fade', 'none']),
            'layers' => $calques,
            'vars'   => $vars,
        ];
    }
    return ['items' => $items];
}

// ---------- Propositions du panneau client (saisie/) ----------
// data/propositions.json : { items: [{ id, at, nouveau, club }] }, une proposition par club au plus.
// Hors de la liste FICHIERS : lire.php ne peut pas la lire. Seule la régie (admin/propositions.php)
// les voit et les accepte ou les refuse.

function lire_propositions() {
    $c = json_decode((string) @file_get_contents(dossier_data() . '/propositions.json'), true);
    return (is_array($c) && is_array($c['items'] ?? null)) ? $c['items'] : [];
}

// Modifie les propositions sous verrou ; $fn reçoit la liste et renvoie la nouvelle.
function modifier_propositions(callable $fn) {
    $dossier = dossier_data();
    $verrou = @fopen($dossier . '/propositions.lock', 'c');
    if (!$verrou || !flock($verrou, LOCK_EX)) {
        echec(500, 'Écriture impossible : vérifie que le dossier data/ est accessible en écriture');
    }
    $items = $fn(lire_propositions());
    $chemin = $dossier . '/propositions.json';
    $ok = file_put_contents($chemin . '.tmp', json_encode(['items' => array_values($items)], JSON_UNESCAPED_UNICODE)) !== false
        && rename($chemin . '.tmp', $chemin);
    flock($verrou, LOCK_UN);
    if (!$ok) echec(500, 'Écriture impossible : vérifie que le dossier data/ est accessible en écriture');
    return $items;
}

// Images en attente utilisées par un club (logo, photos)
function images_attente($club) {
    $sortie = [];
    foreach (array_merge([$club['logo'] ?? ''], array_column($club['players'] ?? [], 'photo')) as $v) {
        if (is_string($v) && strpos($v, 'uploads/attente/') === 0) $sortie[] = $v;
    }
    return $sortie;
}

// Supprime les images en attente qui ne servent plus à aucune proposition
function nettoyer_attente($images, $items) {
    $utilisees = [];
    foreach ($items as $p) foreach (images_attente($p['club']) as $v) $utilisees[$v] = true;
    foreach ($images as $v) {
        if (!isset($utilisees[$v]) && preg_match('#^uploads/attente/[a-f0-9]{24}\.(png|jpg|webp)$#', $v)) {
            @unlink(dirname(__DIR__) . '/' . $v);
        }
    }
}

// ---------- Karting (Apex Timing) ----------
// Lien du live timing, tracé de la piste (chemins SVG), noms des pilotes par numéro de kart,
// réglages des overlays et mode démo. Les temps eux-mêmes ne passent pas par le serveur :
// chaque page se connecte directement au flux Apex (assets/apex.js).

function chemin_svg($v) {
    return (is_string($v) && strlen($v) <= 30000 && preg_match('/^[MCLZHVSQTAmclzhvsqta0-9 ,.\-\n]*$/', $v)) ? trim($v) : '';
}

function nettoyer_trace($t) {
    $t = is_array($t) ? $t : [];
    $paths = is_array($t['paths'] ?? null) ? $t['paths'] : [];
    $times = is_array($t['times'] ?? null) ? $t['times'] : [];
    $sortie = ['paths' => [], 'times' => []];
    foreach (['track', 's1', 's2', 's3', 'in', 'out'] as $k) $sortie['paths'][$k] = chemin_svg($paths[$k] ?? '');
    foreach (['track', 's1', 's2', 's3'] as $k) $sortie['times'][$k] = entier($times[$k] ?? 0, 0, 3600000);
    $vb = is_string($t['viewbox'] ?? null) && preg_match('/^-?[0-9.]+ -?[0-9.]+ [0-9.]+ [0-9.]+$/', trim($t['viewbox'])) ? trim($t['viewbox']) : '';
    return ['id' => texte((string) ($t['id'] ?? ''), 10), 'title' => texte($t['title'] ?? '', 60), 'viewbox' => $vb] + $sortie;
}

function nettoyer_karting($e) {
    $url = is_string($e['url'] ?? null) && preg_match('#^https://(www\.)?apex-timing\.com/live-timing/[A-Za-z0-9_\-]+/#', $e['url']) ? texte($e['url'], 300) : '';
    $host = is_string($e['host'] ?? null) && preg_match('/^([a-z0-9\-]+\.)*apex-timing\.com$/', $e['host']) ? $e['host'] : 'live-data.apex-timing.com';
    $noms = [];
    foreach ((is_array($e['names'] ?? null) ? $e['names'] : []) as $no => $n) {
        if (!preg_match('/^\d{1,4}$/', (string) $no) || !is_array($n) || count($noms) >= 150) continue;
        $nom = texte($n['name'] ?? '', 30); $eq = texte($n['team'] ?? '', 30);
        if ($nom !== '' || $eq !== '') $noms[(string) $no] = ['name' => $nom, 'team' => $eq];
    }
    $listes = [];
    foreach ((is_array($e['tracks'] ?? null) ? $e['tracks'] : []) as $t) {
        if (is_array($t) && count($listes) < 30) $listes[] = ['id' => texte((string) ($t['id'] ?? ''), 10), 'title' => texte($t['title'] ?? '', 60)];
    }
    $tower = is_array($e['tower'] ?? null) ? $e['tower'] : [];
    $demo = is_array($e['demo'] ?? null) ? $e['demo'] : [];
    // pilote : numéro de kart, ou ligne Apex (r12345) quand le circuit n'envoie pas de numéros
    $kart = function ($v) { return is_scalar($v) && preg_match('/^(\d{1,4}|r\d{1,9})$/', (string) $v) ? (string) $v : ''; };
    $duel = is_array($e['duel'] ?? null) ? $e['duel'] : [];
    return [
        'url'    => $url,
        'host'   => $host,
        'port'   => entier($e['port'] ?? 0, 0, 65530),
        'title'  => texte($e['title'] ?? '', 60),
        'tracks' => $listes,
        'track'  => nettoyer_trace($e['track'] ?? null),
        'names'  => (object) $noms,
        'tower'  => [
            'rows' => entier($tower['rows'] ?? 10, 3, 30),
            'mode' => ($tower['mode'] ?? '') === 'int' ? 'int' : 'gap',   // écart au premier, ou intervalle
            'best' => !array_key_exists('best', $tower) || !empty($tower['best']),   // colonne meilleur tour
            'names' => in_array($tower['names'] ?? '', ['code', 'short', 'full'], true) ? $tower['names'] : 'code',   // MAR / L. MARTIN / LÉO MARTIN
        ],
        'focus'  => $kart($e['focus'] ?? ''),                      // pilote suivi (numéro de kart)
        'duel'   => [$kart($duel[0] ?? ''), $kart($duel[1] ?? '')],
        'demo'   => [
            'on'    => !empty($demo['on']),
            'start' => entier($demo['start'] ?? 0, 0, 99999999999999),
            'seed'  => entier($demo['seed'] ?? 1, 1, 999999),
            'karts' => entier($demo['karts'] ?? 12, 4, 24),
            'mode'  => in_array($demo['mode'] ?? '', ['sprint', 'endurance', 'loisir'], true) ? $demo['mode'] : 'sprint',
            'laps'  => entier($demo['laps'] ?? 15, 3, 200),
        ],
    ];
}

