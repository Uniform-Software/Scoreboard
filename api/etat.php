<?php
// etat.php : fonctions communes, incluses par api/lire.php et admin/ecrire.php.
// Ce fichier n'affiche rien s'il est ouvert directement.
//
// Chaque fichier de données (data/score.json, data/equipes.json) contient :
//   { "rev": 12, "state": { ... } }
// "rev" augmente de 1 à chaque écriture : il permet de détecter qu'une autre
// page de contrôle a modifié les données entre-temps (voir ecrire_etat).

const FICHIERS = ['score', 'equipes'];

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
    echo json_encode($donnees, JSON_UNESCAPED_UNICODE);
    exit;
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
function ecrire_etat($f, $rev_client, $etat_brut) {
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
        repondre(409, ['ok' => false, 'error' => 'Conflit'] + $actuel);
    }

    $nouveau = [
        'rev'   => $actuel['rev'] + 1,
        'state' => $f === 'score' ? nettoyer_score($etat_brut) : nettoyer_equipes($etat_brut),
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

function couleur($valeur) {
    return (is_string($valeur) && preg_match('/^#[0-9a-fA-F]{6}$/', $valeur)) ? strtolower($valeur) : '#888888';
}

function cote($valeur) {
    return in_array($valeur, ['home', 'away'], true) ? $valeur : '';
}

// Logo : soit le nom d'une image du dossier logos/ (ex. iut.png), soit une adresse https complète.
function logo($valeur) {
    $valeur = is_string($valeur) ? trim($valeur) : '';
    if (strlen($valeur) > 300 || !preg_match('/\.(png|jpe?g|gif|webp|svg)$/i', $valeur)) {
        return '';
    }
    if (preg_match('#^[A-Za-z0-9_\-.]+$#', $valeur) && strpos($valeur, '..') === false) {
        return $valeur;
    }
    if (preg_match('#^https://[A-Za-z0-9.\-]+(:[0-9]+)?/[A-Za-z0-9_\-./%]+$#', $valeur)) {
        return $valeur;
    }
    return '';
}

// Liste de joueurs : une ligne = un joueur, lignes vides ignorées.
function lignes($valeur, $max_lignes) {
    $sortie = [];
    foreach ((is_array($valeur) ? $valeur : []) as $ligne) {
        $t = texte($ligne, 40);
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
            'color' => couleur($t['color'] ?? ''),
            'score' => entier($t['score'] ?? 0, 0, 999),
            'sets'  => entier($t['sets'] ?? 0, 0, 9),
        ];
    };

    return [
        'sport'   => $sport,
        'visible' => !empty($e['visible']),
        'home'    => $equipe($e['home'] ?? null),
        'away'    => $equipe($e['away'] ?? null),
        'period'  => entier($e['period'] ?? 0, 0, max(0, $nb_periodes - 1)),
        'clock'   => [
            'running'   => !empty($chrono['running']),
            'baseMs'    => entier($chrono['baseMs'] ?? 0, 0, 36000000),
            'startedAt' => entier($chrono['startedAt'] ?? 0, 0, 99999999999999),
        ],
        'added'   => entier($e['added'] ?? 0, 0, 30),
        'serve'   => cote($e['serve'] ?? ''),
        // Dernière action de score : sert à déclencher le bandeau animé ("BUT !") sur l'affichage.
        'event'   => [
            'id'    => entier($evenement['id'] ?? 0, 0, 2000000000),
            'team'  => cote($evenement['team'] ?? ''),
            'label' => texte($evenement['label'] ?? '', 24),
        ],
    ];
}

function nettoyer_equipes($e) {
    $equipe = function ($t) {
        $t = is_array($t) ? $t : [];
        return [
            'name'     => texte($t['name'] ?? '', 24),
            'color'    => couleur($t['color'] ?? ''),
            'logo'     => logo($t['logo'] ?? ''),
            'coach'    => texte($t['coach'] ?? '', 40),
            'starters' => lignes($t['starters'] ?? null, 20),
            'subs'     => lignes($t['subs'] ?? null, 20),
        ];
    };

    return [
        'visible' => !empty($e['visible']),
        'title'   => texte($e['title'] ?? '', 60),
        'home'    => $equipe($e['home'] ?? null),
        'away'    => $equipe($e['away'] ?? null),
    ];
}
