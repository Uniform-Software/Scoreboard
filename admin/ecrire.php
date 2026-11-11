<?php
// ecrire.php : enregistre les données envoyées par les pages de la régie.
// Protégé par mot de passe, comme tout le dossier admin/ (voir admin/.htaccess).
//
// Corps attendu (JSON) : { "f": "score" | "equipes", "rev": 12, "state": { ... } }

require dirname(__DIR__) . '/api/etat.php';

// Uniquement des envois (POST) au format JSON. Exiger "application/json" bloque aussi
// les envois depuis un autre site (le navigateur demanderait une autorisation jamais donnée).
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echec(405, 'POST uniquement');
}
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) {
    echec(415, 'JSON uniquement');
}

$entree = json_decode(file_get_contents('php://input', false, null, 0, 40000), true);
if (!is_array($entree) || !is_int($entree['rev'] ?? null)) {
    echec(400, 'Données invalides');
}

$nouveau = ecrire_etat(
    $entree['f'] ?? '',
    $entree['rev'],
    is_array($entree['state'] ?? null) ? $entree['state'] : []
);

repondre(200, ['ok' => true] + $nouveau);
