<?php
// equipes-ecrire.php : enregistre les compositions envoyées par equipes-controle.html.
// IMPORTANT : ce fichier doit être protégé par mot de passe dans le .htaccess,
// comme equipes-controle.html.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function echec($code, $message) {
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $message]);
    exit;
}

// 1. Uniquement des envois (POST) au format JSON.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echec(405, 'POST uniquement');
}
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) {
    echec(415, 'JSON uniquement');
}

// 2. Lecture des données (30 000 caractères maximum).
$brut = file_get_contents('php://input', false, null, 0, 30000);
$entree = json_decode($brut, true);
if (!is_array($entree)) {
    echec(400, 'JSON invalide');
}

// 3. On ne stocke jamais les données brutes : on reconstruit tout en vérifiant chaque valeur.
function texte($valeur, $max) {
    $valeur = is_string($valeur) ? $valeur : '';
    $valeur = preg_replace('/[\x00-\x1F\x7F]+/', ' ', $valeur); // retire retours à la ligne et caractères de contrôle
    $valeur = trim($valeur);
    return function_exists('mb_substr') ? mb_substr($valeur, 0, $max) : substr($valeur, 0, $max);
}

function couleur($valeur) {
    return (is_string($valeur) && preg_match('/^#[0-9a-fA-F]{6}$/', $valeur)) ? $valeur : '#888888';
}

// Logo : une adresse https complète ou un chemin simple (ex. logos/iut.png), uniquement des images.
function logo($valeur) {
    $valeur = is_string($valeur) ? trim($valeur) : '';
    if ($valeur === '' || strlen($valeur) > 300 || strpos($valeur, '..') !== false) {
        return '';
    }
    if (!preg_match('/\.(png|jpe?g|gif|webp|svg)$/i', $valeur)) {
        return '';
    }
    if (preg_match('#^https://[A-Za-z0-9.\-]+(:[0-9]+)?/[A-Za-z0-9_\-./%]+$#', $valeur)) {
        return $valeur;
    }
    if (preg_match('#^[A-Za-z0-9_\-./]+$#', $valeur) && strpos($valeur, '//') !== 0) {
        return $valeur;
    }
    return '';
}

// Liste de joueurs : une ligne = un joueur (lignes vides ignorées).
function lignes($valeur, $maxLignes) {
    $sortie = [];
    if (is_array($valeur)) {
        foreach ($valeur as $ligne) {
            $t = texte($ligne, 40);
            if ($t !== '') {
                $sortie[] = $t;
            }
            if (count($sortie) >= $maxLignes) {
                break;
            }
        }
    }
    return $sortie;
}

function equipe($e) {
    $e = is_array($e) ? $e : [];
    return [
        'name'     => texte($e['name'] ?? '', 24),
        'color'    => couleur($e['color'] ?? ''),
        'logo'     => logo($e['logo'] ?? ''),
        'coach'    => texte($e['coach'] ?? '', 40),
        'starters' => lignes($e['starters'] ?? null, 20),
        'subs'     => lignes($e['subs'] ?? null, 20),
    ];
}

$etat = [
    'home' => equipe($entree['home'] ?? null),
    'away' => equipe($entree['away'] ?? null),
];

// 4. Écriture dans equipes.json (fichier temporaire puis renommage, pour éviter une lecture à moitié écrite).
$fichier = __DIR__ . '/equipes.json';
$temporaire = $fichier . '.tmp';

if (file_put_contents($temporaire, json_encode($etat), LOCK_EX) === false || !rename($temporaire, $fichier)) {
    echec(500, "Ecriture impossible : verifie que le dossier est accessible en ecriture");
}

echo json_encode(['ok' => true, 'state' => $etat]);
