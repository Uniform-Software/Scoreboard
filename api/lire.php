<?php
// lire.php?f=score   ou   lire.php?f=equipes
// Renvoie les données actuelles. Accessible à tout le monde : utilisé par les overlays (OBS)
// et par les pages de la régie.

require __DIR__ . '/etat.php';

repondre(200, lire_etat($_GET['f'] ?? ''));
