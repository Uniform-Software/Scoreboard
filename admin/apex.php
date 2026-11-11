<?php
// apex.php : lit la configuration d'un live timing Apex Timing à partir du lien de la page du circuit
// (https://www.apex-timing.com/live-timing/<circuit>/index.html) : port du flux, nom, tracés de piste.
// Protégé par mot de passe, comme tout le dossier admin/. Seules les adresses apex-timing.com sont lues.
//
// GET ?url=<lien>   →  { ok, url, host, port, title, tracks: [{id, title, viewbox, paths, times}], default }

require dirname(__DIR__) . '/api/etat.php';

$url = trim((string) ($_GET['url'] ?? ''));
// accepte aussi le lien sans « https:// » ni « www. », avec ou sans index.html
if (!preg_match('#^(?:https?://)?(www\.)?apex-timing\.com/live-timing/([A-Za-z0-9_\-]+)(?:[/?\#]|$)#i', $url, $m)) {
    echec(400, 'Lien Apex Timing attendu : https://www.apex-timing.com/live-timing/<circuit>/index.html');
}
$base = 'https://www.apex-timing.com/live-timing/' . $m[2] . '/';

// Télécharge une adresse d'apex-timing.com : curl si disponible, sinon les flux PHP.
// $raison reçoit la cause d'un échec (pour un message d'erreur utile).
function telecharger($u, &$raison = '') {
    $raison = '';
    if (function_exists('curl_init')) {
        $c = curl_init($u);
        curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false, CURLOPT_TIMEOUT => 10, CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4, CURLOPT_USERAGENT => 'Mozilla/5.0 (Scoreboard UNI)', CURLOPT_MAXFILESIZE => 3000000]);
        $r = curl_exec($c);
        $code = (int) curl_getinfo($c, CURLINFO_HTTP_CODE);
        if ($r !== false && $code === 200) return $r;
        $raison = $r === false ? 'connexion impossible (' . curl_error($c) . ')' : "réponse HTTP $code";
    }
    if (ini_get('allow_url_fopen') && in_array('https', stream_get_wrappers(), true)) {
        $ctx = stream_context_create(['http' => ['timeout' => 10, 'follow_location' => 0, 'ignore_errors' => true, 'header' => "User-Agent: Mozilla/5.0 (Scoreboard UNI)\r\n"]]);
        $r = @file_get_contents($u, false, $ctx, 0, 3000000);
        $entetes = function_exists('http_get_last_response_headers') ? (http_get_last_response_headers() ?: []) : ($http_response_header ?? []);
        $code = isset($entetes[0]) && preg_match('/\s(\d{3})\s/', $entetes[0], $mm) ? (int) $mm[1] : 0;
        if ($r !== false && $code === 200) return $r;
        $raison = $raison ?: ($r === false ? 'connexion impossible' : "réponse HTTP $code");
    } elseif (!$raison) {
        $raison = 'PHP ne peut pas ouvrir d\'adresse https (extensions curl et openssl absentes, ou allow_url_fopen désactivé)';
    }
    return null;
}

$config = telecharger($base . 'javascript/config.js', $raison);
if ($config === null) {
    if (preg_match('/HTTP 404/', $raison)) echec(404, "Circuit « {$m[2]} » introuvable sur Apex Timing : vérifie le lien (il doit ouvrir le live timing dans ton navigateur)");
    echec(502, "Le serveur de la régie n'arrive pas à joindre apex-timing.com : $raison. Vérifie sa connexion internet (pare-feu, proxy, hébergement qui bloque les sorties).");
}
if (!preg_match('/configPort\s*=\s*(\d+)/', $config, $p)) {
    echec(404, "Ce lien ne ressemble pas à un live timing Apex (pas de port dans sa configuration) : vérifie le lien");
}
$host = preg_match("/configHost\s*=\s*['\"]([a-z0-9.\-]+\.apex-timing\.com)['\"]/", $config, $h) ? $h[1] : 'live-data.apex-timing.com';
$titre = preg_match("/logo_title\s*=\s*'([^']+)'/", $config, $t) || preg_match("/\btitle\s*=\s*'([^']+)'/", $config, $t)
    ? html_entity_decode($t[1], ENT_QUOTES, 'UTF-8') : $m[2];

// Tracés : on ne garde que les chemins SVG (validés), jamais le SVG brut
$tracks = [];
$defaut = '';
$json = json_decode((string) telecharger($base . 'ftp/tracks.json'), true);
if (is_array($json) && !empty($json['enabled']) && is_array($json['list'] ?? null)) {
    $defaut = (string) ($json['default'] ?? '');
    foreach (array_slice($json['list'], 0, 30) as $tr) {
        if (!is_array($tr)) continue;
        $paths = [];
        if (preg_match_all('/<path[^>]*data-type="(\w+)"[^>]*\sd="([^"]*)"/', (string) ($tr['svg'] ?? ''), $mm, PREG_SET_ORDER)) {
            foreach ($mm as $x) if (!isset($paths[$x[1]])) $paths[$x[1]] = $x[2];
        }
        $tracks[] = nettoyer_trace([
            'id' => (string) ($tr['id'] ?? ''), 'title' => (string) ($tr['title'] ?? ''),
            'viewbox' => (string) ($tr['size']['viewbox'] ?? ''), 'paths' => $paths, 'times' => $tr['times'] ?? [],
        ]);
    }
}

repondre(200, [
    'ok' => true, 'url' => $base . 'index.html', 'host' => $host, 'port' => (int) $p[1],
    'title' => texte($titre, 60), 'tracks' => $tracks, 'default' => $defaut,
]);
