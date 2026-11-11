<?php
// upload.php : reçoit une image (logo, photo de joueur) envoyée depuis la régie.
// Protégé par mot de passe, comme tout le dossier admin/ (voir admin/.htaccess).
//
// POST multipart, champ « file ». Réponse : { "ok": true, "path": "uploads/<nom>.<ext>" }

require dirname(__DIR__) . '/api/etat.php';

const TAILLE_MAX = 5 * 1024 * 1024;   // 5 Mo
const TYPES = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp', 'image/svg+xml' => 'svg'];

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echec(405, 'POST uniquement');
}
$fichier = $_FILES['file'] ?? null;
if (!is_array($fichier) || ($fichier['error'] ?? 1) !== UPLOAD_ERR_OK || !is_uploaded_file($fichier['tmp_name'])) {
    echec(400, 'Aucune image reçue');
}
if ($fichier['size'] > TAILLE_MAX) {
    echec(413, 'Image trop lourde (5 Mo au plus)');
}

// Type réel, lu dans le contenu du fichier (jamais d'après son nom ou ce qu'annonce le navigateur)
$type = (new finfo(FILEINFO_MIME_TYPE))->file($fichier['tmp_name']);
if ($type === 'text/xml' || $type === 'application/xml' || $type === 'text/plain') {
    $debut = file_get_contents($fichier['tmp_name'], false, null, 0, 2000);
    if (stripos($debut, '<svg') !== false) {
        $type = 'image/svg+xml';
    }
}
if (!isset(TYPES[$type])) {
    echec(415, 'Format refusé : PNG, JPEG, WebP ou SVG uniquement');
}

if ($type === 'image/svg+xml') {
    // Un SVG peut contenir du code : on refuse tout ce qui n'est pas du dessin
    $svg = file_get_contents($fichier['tmp_name']);
    if (preg_match('/<script|<foreignObject|<!ENTITY|<!DOCTYPE|\son\w+\s*=|javascript:|(xlink:)?href\s*=\s*["\']\s*(https?:|data:|\/\/)/i', $svg)) {
        echec(415, 'SVG refusé : il contient du code ou des liens externes');
    }
} elseif (@getimagesize($fichier['tmp_name']) === false) {
    echec(415, 'Image illisible');
}

// Nom unique et imprévisible, extension imposée par le type réel
$dossier = dirname(__DIR__) . '/uploads';
if (!is_dir($dossier) && !@mkdir($dossier, 0775, true)) {
    echec(500, 'Dossier uploads/ introuvable');
}
$nom = bin2hex(random_bytes(12)) . '.' . TYPES[$type];
if (!move_uploaded_file($fichier['tmp_name'], "$dossier/$nom")) {
    echec(500, 'Enregistrement impossible : vérifie que le dossier uploads/ est accessible en écriture');
}
@chmod("$dossier/$nom", 0644);

repondre(200, ['ok' => true, 'path' => "uploads/$nom"]);
