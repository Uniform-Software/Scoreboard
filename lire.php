<?php
// lire.php : renvoie le score actuel. Accessible à tout le monde (il ne contient que le score).
// Utilisé par affichage.html (dans OBS) et par controle.html au chargement.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$fichier = __DIR__ . '/etat.json';

$etat = null;
if (is_file($fichier)) {
    $etat = json_decode(file_get_contents($fichier), true);
}

// On renvoie aussi l'heure du serveur : elle sert à synchroniser le chrono
// entre les appareils, même si leurs horloges ne sont pas exactement à l'heure.
echo json_encode([
    'serverTime' => (int) round(microtime(true) * 1000),
    'state'      => $etat,
]);
