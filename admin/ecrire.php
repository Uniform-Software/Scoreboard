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

// 3 Mo au plus (la bibliothèque des clubs est le plus gros fichier)
$entree = json_decode(file_get_contents('php://input', false, null, 0, 3000000), true);
if (!is_array($entree) || !is_int($entree['rev'] ?? null)) {
    echec(400, 'Données invalides');
}

// Page ouverte avant une mise à jour du site : on refuse ses envois (son code est périmé),
// elle se recharge et repart de la version actuelle.
if (($entree['version'] ?? null) !== version_code()) {
    echec(409, 'Page périmée : rechargement');
}

$nouveau = ecrire_etat(
    $entree['f'] ?? '',
    $entree['rev'],
    is_array($entree['state'] ?? null) ? $entree['state'] : []
);

repondre(200, ['ok' => true] + $nouveau);
