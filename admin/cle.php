<?php
// cle.php : clés secrètes des accès distants (Stream Deck, arbitre, client).
// Protégé par mot de passe, comme tout le dossier admin/. Les clés sont enregistrées dans data/cle.json,
// que ni lire.php ni le web ne peuvent lire.
//
// GET  : renvoie les clés { cle, arbitre, client } (crée celles de la régie et de l'arbitre au premier appel)
// POST { role, off? } : génère une nouvelle clé pour ce rôle (l'ancienne ne marche plus),
//                       ou la désactive avec off: true

require dirname(__DIR__) . '/api/etat.php';

function enregistrer($cles) {
    $chemin = dossier_data() . '/cle.json';
    if (file_put_contents($chemin, json_encode($cles), LOCK_EX) === false) {
        echec(500, 'Écriture impossible : vérifie que le dossier data/ est accessible en écriture');
    }
    @chmod($chemin, 0640);
}
// Adresse de l'ordinateur sur le réseau local (pour ouvrir les liens depuis un téléphone
// quand la régie est ouverte en « localhost »). Rien n'est envoyé : la connexion UDP ne sert
// qu'à demander au système quelle interface il utiliserait.
function ip_locale() {
    $s = @stream_socket_client('udp://192.168.255.255:9', $n, $m, 1);
    $nom = $s ? stream_socket_get_name($s, false) : '';
    if ($s) fclose($s);
    $ip = $nom ? preg_replace('/:\d+$/', '', $nom) : '';
    return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) && strpos($ip, '127.') !== 0 ? $ip : '';
}
$nouvelle = function () { return bin2hex(random_bytes(16)); };

$cles = cles();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // même protection que ecrire.php contre les envois depuis un autre site
    if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) {
        echec(415, 'JSON uniquement');
    }
    $demande = json_decode(file_get_contents('php://input'), true);
    $role = is_array($demande) ? ($demande['role'] ?? 'cle') : 'cle';
    if (!in_array($role, ROLES, true)) echec(400, 'Rôle inconnu');
    $cles[$role] = !empty($demande['off']) && $role !== 'cle' ? '' : $nouvelle();
    enregistrer($cles);
    repondre(200, ['ok' => true, 'ip' => ip_locale()] + $cles);
}

if ($cles['cle'] === '' || $cles['arbitre'] === '') {
    if ($cles['cle'] === '') $cles['cle'] = $nouvelle();
    if ($cles['arbitre'] === '') $cles['arbitre'] = $nouvelle();
    enregistrer($cles);
}
repondre(200, ['ok' => true, 'ip' => ip_locale()] + $cles);
