<?php
// touche.php : images (et textes) pour les touches du Stream Deck : score ou logo d'une équipe.
// La touche affiche l'image de cette adresse et la rafraîchit (Companion : retour « Image depuis une URL »
// du module Generic HTTP ; logiciel Elgato : un plugin d'image web).
//
//   api/touche.php?cle=<clé>&v=score&equipe=gauche|droite     score sur la couleur de l'équipe
//   api/touche.php?cle=<clé>&v=logo&equipe=gauche|droite      logo de l'équipe (ou son abréviation)
//
//   &format=png (par défaut) | texte | json      &taille=72…288 (côté de l'image, 144 par défaut)

require __DIR__ . '/etat.php';

if (role_de($_GET['cle'] ?? '') !== 'cle') {
    echec(403, 'Clé invalide');
}

$v = (string) ($_GET['v'] ?? 'score');
if (!in_array($v, ['score', 'logo'], true)) echec(400, 'v=score ou v=logo');
$e = (string) ($_GET['equipe'] ?? 'gauche');
$cote = in_array($e, ['droite', 'away', 'd', '2'], true) ? 'away' : (in_array($e, ['gauche', 'home', 'g', '1'], true) ? 'home' : '');
if (!$cote) echec(400, 'equipe=gauche ou equipe=droite');
$format = (string) ($_GET['format'] ?? 'png');
$taille = entier($_GET['taille'] ?? 144, 72, 288);

$S = lire_etat('score')['state'];
if (!$S) echec(409, 'Ouvre la régie une première fois : aucun match pour l’instant');
$t = $S[$cote];
$sport = sports()[$S['sport']] ?? [];
$sets = !empty($sport['sets']);

// Abréviation : celle saisie, sinon les 3 premières lettres du nom (comme assets/commun.js)
function code_equipe($t) {
    if ($t['code'] !== '') return $t['code'];
    $n = @iconv('UTF-8', 'ASCII//TRANSLIT', $t['name']) ?: $t['name'];
    return strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $n), 0, 3));
}
$code = code_equipe($t);

if ($format === 'texte') {
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    echo $v === 'score' ? $t['score'] : $code;
    exit;
}
if ($format === 'json') {
    repondre(200, ['ok' => true, 'equipe' => $cote === 'home' ? 'gauche' : 'droite', 'nom' => $t['name'], 'code' => $code,
        'couleur' => $t['color'], 'score' => $t['score'], 'sets' => $t['sets'], 'logo' => $t['logo']]);
}

// ---------- Image ----------
$racine = dirname(__DIR__);
$fichier_logo = function ($logo) use ($racine) {
    if ($logo === '' || preg_match('#^https://#', $logo)) return '';          // pas d'image distante
    $chemin = strpos($logo, 'uploads/') === 0 ? "$racine/$logo" : "$racine/logos/$logo";
    return is_file($chemin) ? $chemin : '';
};

if (!function_exists('imagecreatetruecolor')) {
    // Pas de GD sur ce serveur : le logo tel quel, sinon le texte
    $f = $v === 'logo' ? $fichier_logo($t['logo']) : '';
    if ($f) { header('Location: ../' . substr($f, strlen($racine) + 1)); exit; }
    header('Content-Type: text/plain; charset=utf-8');
    echo $v === 'score' ? $t['score'] : $code;
    exit;
}

$police = $racine . '/assets/fonts/ArchivoBlack-Regular.ttf';
$T = $taille;
$img = imagecreatetruecolor($T, $T);
imagesavealpha($img, true);
$rgb = function ($hex) use ($img) {
    return imagecolorallocate($img, hexdec(substr($hex, 1, 2)), hexdec(substr($hex, 3, 2)), hexdec(substr($hex, 5, 2)));
};
// texte noir ou blanc selon la couleur de fond (même règle que la régie)
$clair = function ($hex) {
    $r = hexdec(substr($hex, 1, 2)); $g = hexdec(substr($hex, 3, 2)); $b = hexdec(substr($hex, 5, 2));
    return ($r * 299 + $g * 587 + $b * 114) / 1000 > 150;
};
$fond = $t['color'];
$encre = $clair($fond) ? '#0b0b0f' : '#ffffff';

// Texte centré horizontalement, réduit jusqu'à tenir dans la largeur
$texte = function ($txt, $taillePolice, $yBase, $couleur, $largeurMax) use ($img, $police, $T) {
    do {
        $b = imagettfbbox($taillePolice, 0, $police, $txt);
        $w = $b[2] - $b[0];
        if ($w <= $largeurMax || $taillePolice <= 8) break;
        $taillePolice -= 2;
    } while (true);
    imagettftext($img, $taillePolice, 0, (int) (($T - $w) / 2 - $b[0]), (int) $yBase, $couleur, $police, $txt);
};

if ($v === 'score') {
    imagefilledrectangle($img, 0, 0, $T, $T, $rgb($fond));
    $ink = $rgb($encre);
    // bandeau du haut : abréviation sur fond sombre / clair inversé
    $bande = (int) round($T * 0.28);
    imagefilledrectangle($img, 0, 0, $T, $bande, $rgb($encre === '#ffffff' ? '#0b0b0f' : '#ffffff'));
    $texte($code, $T * 0.13, $bande * 0.74, $rgb($encre === '#ffffff' ? '#ffffff' : '#0b0b0f'), $T * 0.9);
    $texte((string) $t['score'], $T * 0.40, $T * 0.80, $ink, $T * 0.9);
    if ($sets) $texte('SETS ' . $t['sets'], $T * 0.08, $T * 0.95, $ink, $T * 0.9);
} else {
    // logo sur fond blanc, liseré de la couleur de l'équipe
    imagefilledrectangle($img, 0, 0, $T, $T, $rgb($fond));
    $m = (int) round($T * 0.06);
    imagefilledrectangle($img, $m, $m, $T - $m - 1, $T - $m - 1, $rgb('#ffffff'));
    $f = $fichier_logo($t['logo']);
    $src = null;
    if ($f) {
        $data = @file_get_contents($f);
        $src = $data !== false && !preg_match('/\.svg$/i', $f) ? @imagecreatefromstring($data) : null;
    }
    if ($src) {
        $sw = imagesx($src); $sh = imagesy($src);
        $place = $T - 2 * $m - (int) round($T * 0.12);
        $k = min($place / $sw, $place / $sh);
        $dw = (int) round($sw * $k); $dh = (int) round($sh * $k);
        imagealphablending($img, true);
        imagecopyresampled($img, $src, (int) (($T - $dw) / 2), (int) (($T - $dh) / 2), 0, 0, $dw, $dh, $sw, $sh);
    } else {
        // pas de logo (ou SVG, que GD ne sait pas lire) : l'abréviation
        $texte($code, $T * 0.24, $T * 0.62, $rgb('#0b0b0f'), $T * 0.78);
    }
}

header('Content-Type: image/png');
header('Cache-Control: no-store');
imagepng($img);
