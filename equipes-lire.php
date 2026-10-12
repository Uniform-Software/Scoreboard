<?php
// equipes-lire.php : renvoie les données de l'affichage des équipes
// (présentation du match et compositions). Accessible à tout le monde.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$fichier = __DIR__ . '/equipes.json';

$etat = null;
if (is_file($fichier)) {
    $etat = json_decode(file_get_contents($fichier), true);
}

echo json_encode(['state' => $etat]);
