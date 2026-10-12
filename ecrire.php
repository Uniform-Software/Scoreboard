<?php
// ecrire.php : enregistre le score envoyé par controle.html.
// IMPORTANT : ce fichier doit être protégé par mot de passe dans le .htaccess,
// exactement comme controle.html.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function echec($code, $message) {
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $message]);
    exit;
}

// 1. On n'accepte que l'envoi de données (POST) au format JSON.
//    Exiger "application/json" bloque aussi les envois depuis un autre site
//    (le navigateur demanderait une autorisation que ce serveur ne donne jamais).
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echec(405, 'POST uniquement');
}
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) {
    echec(415, 'JSON uniquement');
}

// 2. On lit les données (20 000 caractères maximum).
$brut = file_get_contents('php://input', false, null, 0, 20000);
$entree = json_decode($brut, true);
if (!is_array($entree)) {
    echec(400, 'JSON invalide');
}

// 3. On ne stocke jamais les données brutes : on reconstruit un score propre,
//    en vérifiant chaque valeur (type, limites, format).
function entier($valeur, $min, $max) {
    return max($min, min($max, (int) $valeur));
}
function texte($valeur) {
    $valeur = is_string($valeur) ? trim($valeur) : '';
    return function_exists('mb_substr') ? mb_substr($valeur, 0, 24) : substr($valeur, 0, 24);
}
function couleur($valeur) {
    return (is_string($valeur) && preg_match('/^#[0-9a-fA-F]{6}$/', $valeur)) ? $valeur : '#888888';
}
function equipe($e) {
    $e = is_array($e) ? $e : [];
    return [
        'name'  => texte($e['name'] ?? ''),
        'color' => couleur($e['color'] ?? ''),
        'score' => entier($e['score'] ?? 0, 0, 999),
        'sets'  => entier($e['sets'] ?? 0, 0, 99),
    ];
}

$sports = ['foot', 'rugby', 'hand', 'basket', 'volley'];
$chrono = (isset($entree['clock']) && is_array($entree['clock'])) ? $entree['clock'] : [];

$etat = [
    'sport'  => in_array($entree['sport'] ?? '', $sports, true) ? $entree['sport'] : 'foot',
    'home'   => equipe($entree['home'] ?? null),
    'away'   => equipe($entree['away'] ?? null),
    'period' => entier($entree['period'] ?? 0, 0, 10),
    'clock'  => [
        'running'   => !empty($chrono['running']),
        'dir'       => (($chrono['dir'] ?? '') === 'down') ? 'down' : 'up',
        'baseMs'    => entier($chrono['baseMs'] ?? 0, 0, 36000000),
        'startedAt' => entier($chrono['startedAt'] ?? 0, 0, 99999999999999),
    ],
];

// 4. On écrit le fichier etat.json (d'abord dans un fichier temporaire, puis on le renomme,
//    pour que la page d'affichage ne lise jamais un fichier à moitié écrit).
$fichier = __DIR__ . '/etat.json';
$temporaire = $fichier . '.tmp';

if (file_put_contents($temporaire, json_encode($etat), LOCK_EX) === false || !rename($temporaire, $fichier)) {
    echec(500, "Ecriture impossible : verifie que le dossier est accessible en ecriture");
}

echo json_encode([
    'ok'         => true,
    'serverTime' => (int) round(microtime(true) * 1000),
    'state'      => $etat,
]);
