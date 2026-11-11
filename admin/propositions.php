<?php
// propositions.php : fiches de club proposées par le panneau client (saisie/), à valider par la régie.
// Protégé par mot de passe, comme tout le dossier admin/.
//
// GET                                   liste des propositions
// POST { id, action: "accepter" }       applique la fiche à la bibliothèque (images déplacées dans uploads/)
// POST { id, action: "refuser" }        supprime la proposition et ses images

require dirname(__DIR__) . '/api/etat.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    repondre(200, ['ok' => true, 'items' => lire_propositions()]);
}
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) echec(415, 'JSON uniquement');
$demande = json_decode(file_get_contents('php://input'), true);
$id = ident(is_array($demande) ? ($demande['id'] ?? '') : '');
$action = is_array($demande) ? ($demande['action'] ?? '') : '';
if (!$id || !in_array($action, ['accepter', 'refuser'], true)) echec(400, 'id et action=accepter ou refuser');

$prise = null;
foreach (lire_propositions() as $p) if ($p['id'] === $id) $prise = $p;
if (!$prise) echec(404, 'Proposition introuvable (déjà traitée ?)');
$retirer = function () use ($id) {
    return array_values(modifier_propositions(function ($items) use ($id) {
        return array_filter($items, function ($p) use ($id) { return $p['id'] !== $id; });
    }));
};

if ($action === 'refuser') {
    $reste = $retirer();
    nettoyer_attente(images_attente($prise['club']), $reste);
    repondre(200, ['ok' => true, 'items' => $reste]);
}

// Accepter : les images en attente rejoignent uploads/ (nouveau nom), puis la fiche remplace
// celle du club (ou s'ajoute à la bibliothèque).
$club = $prise['club'];
$racine = dirname(__DIR__);
$deplaces = [];                                   // une même image peut servir deux fois (logo et photo)
$deplacer = function ($v) use ($racine, &$deplaces) {
    if (!is_string($v) || !preg_match('#^uploads/attente/[a-f0-9]{24}\.(png|jpg|webp)$#', $v, $m)) return $v;
    if (isset($deplaces[$v])) return $deplaces[$v];
    $nouveau = 'uploads/' . bin2hex(random_bytes(12)) . '.' . $m[1];
    return $deplaces[$v] = @rename("$racine/$v", "$racine/$nouveau") ? $nouveau : '';
};
$club['logo'] = $deplacer($club['logo']);
foreach ($club['players'] as &$j) $j['photo'] = $deplacer($j['photo']);
unset($j);
$club = nettoyer_clubs(['clubs' => [$club]])['clubs'][0];

for ($essai = 0; $essai < 5; $essai++) {
    $actuel = lire_etat('clubs');
    $C = $actuel['state'] ?: ['clubs' => []];
    $trouve = false;
    foreach ($C['clubs'] as &$c) {
        if ($c['id'] === $club['id']) { $c = $club; $trouve = true; }
    }
    unset($c);
    if (!$trouve) {
        if (count($C['clubs']) >= 200) echec(409, 'Bibliothèque pleine (200 clubs)');
        $C['clubs'][] = $club;
    }
    if (ecrire_etat('clubs', $actuel['rev'], $C, false)) {
        repondre(200, ['ok' => true, 'items' => $retirer(), 'club' => $club['id']]);
    }
    usleep(50000);
}
echec(503, 'Trop de modifications en même temps, réessaie');
