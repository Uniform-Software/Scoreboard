<?php
// saisie.php : panneau client (saisie/), ouvert avec la clé « client » (onglet Match › Accès distants).
// Le client propose des fiches de club ; rien n'est appliqué tant que la régie n'a pas validé.
//
//   GET  ?cle=…                 clubs actuels + identifiants des clubs déjà en attente
//   POST ?cle=…  (JSON)         { club: {…} } : propose une fiche (remplace sa proposition précédente)
//   POST ?cle=…&a=image         multipart, champ « file » : image (PNG, JPEG, WebP) mise en attente

require __DIR__ . '/etat.php';

const IMAGE_MAX = 3 * 1024 * 1024;     // 3 Mo
const IMAGES_ATTENTE_MAX = 400;         // garde-fou : place disque
const PROPOSITIONS_MAX = 100;
const TYPES_CLIENT = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp'];

if (role_de($_GET['cle'] ?? '') !== 'client') {
    echec(403, 'Lien invalide ou désactivé : demande un nouveau lien à la régie');
}

$methode = $_SERVER['REQUEST_METHOD'];

// ---------- Image ----------
if ($methode === 'POST' && ($_GET['a'] ?? '') === 'image') {
    $f = $_FILES['file'] ?? null;
    if (!is_array($f) || ($f['error'] ?? 1) !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) echec(400, 'Aucune image reçue');
    if ($f['size'] > IMAGE_MAX) echec(413, 'Image trop lourde (3 Mo au plus)');
    $type = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
    // Pas de SVG ici : il peut contenir du code, et le client n'a pas de mot de passe.
    if (!isset(TYPES_CLIENT[$type]) || @getimagesize($f['tmp_name']) === false) echec(415, 'Format refusé : PNG, JPEG ou WebP uniquement');
    $dossier = dirname(__DIR__) . '/uploads/attente';
    if (!is_dir($dossier) && !@mkdir($dossier, 0775, true)) echec(500, 'Dossier uploads/attente/ introuvable');
    if (count(glob("$dossier/*") ?: []) >= IMAGES_ATTENTE_MAX) echec(507, 'Trop d’images en attente : la régie doit d’abord valider les propositions');
    $nom = bin2hex(random_bytes(12)) . '.' . TYPES_CLIENT[$type];
    if (!move_uploaded_file($f['tmp_name'], "$dossier/$nom")) echec(500, 'Enregistrement impossible');
    @chmod("$dossier/$nom", 0644);
    repondre(200, ['ok' => true, 'path' => "uploads/attente/$nom"]);
}

// ---------- Proposition d'une fiche ----------
if ($methode === 'POST') {
    if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) echec(415, 'JSON uniquement');
    $demande = json_decode(file_get_contents('php://input'), true);
    $brut = is_array($demande) ? ($demande['club'] ?? null) : null;
    $club = is_array($brut) ? (nettoyer_clubs(['clubs' => [$brut]], true)['clubs'][0] ?? null) : null;
    if (!$club) echec(400, 'Fiche illisible');
    if ($club['name'] === '') echec(400, 'Le nom du club est obligatoire');

    $existants = array_column(lire_etat('clubs')['state']['clubs'] ?? [], 'id');
    $nouveau = !in_array($club['id'], $existants, true);
    $anciennes = [];
    modifier_propositions(function ($items) use ($club, $nouveau, &$anciennes) {
        foreach ($items as $k => $p) {
            if ($p['id'] === $club['id']) { $anciennes = images_attente($p['club']); unset($items[$k]); }
        }
        if (count($items) >= PROPOSITIONS_MAX) echec(429, 'Trop de propositions en attente : la régie doit d’abord les valider');
        $items[] = ['id' => $club['id'], 'at' => time(), 'nouveau' => $nouveau, 'club' => $club];
        return $items;
    });
    nettoyer_attente($anciennes, lire_propositions());   // images remplacées dans la nouvelle version
    repondre(200, ['ok' => true, 'nouveau' => $nouveau]);
}

// ---------- Lecture ----------
$props = lire_propositions();
repondre(200, [
    'ok'      => true,
    'clubs'   => lire_etat('clubs')['state']['clubs'] ?? [],
    'attente' => array_map(function ($p) { return ['id' => $p['id'], 'at' => $p['at'], 'club' => $p['club']]; }, $props),
]);
