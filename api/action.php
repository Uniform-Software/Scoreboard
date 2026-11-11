<?php
// action.php : commande à distance de la régie (Stream Deck avec Bitfocus Companion, ou toute
// requête web). Chaque action est appliquée ici, côté serveur, avec le même verrou que la régie :
// les pages ouvertes la voient arriver au rafraîchissement suivant.
//
//   api/action.php?cle=<clé>&a=<action>&…           (clé : onglet Match de la régie)
//
//   a=point        equipe=gauche|droite  [type=0]   points (type = rang dans la liste du sport)
//   a=moins        equipe=gauche|droite  [v=1]      retire v points (1 par défaut)
//   a=set          equipe=gauche|droite  [annule=1] set gagné (volley) ; annule=1 : revient au set précédent
//   a=chrono       [etat=bascule|marche|arret]       démarre / arrête le chrono
//   a=periode      n=suivante|precedente|<numéro>    change de période
//   a=statut       v=temps|mi-temps|fin|pause       texte à la place du chrono
//   a=tirs         s=24|14                          horloge des tirs (basket)
//   a=element      nom=score|equipes|lower|sub|card|ticker|g-<id>  [etat=bascule|on|off]
//   a=ecran        type=avant|pause|fin|coupure     choisit l'écran plein cadre et le prépare / l'affiche
//   a=transition   [style=volet|rideau|barres] [scene=<nom de scène OBS>]   transition plein écran
//   a=kart         [suivre=<n° de kart>] [duel=<n°>,<n°>]   karting : pilote suivi, duel
//   a=prendre                                       envoie l'aperçu à l'antenne (mode studio)
//   a=tout_masquer                                  retire tout de l'antenne et de l'aperçu
//   a=etat                                          ne change rien, renvoie le score et le chrono
//
// Réponse : { ok, score: "2-1", gauche, droite, chrono: "23:41", periode, marche }
//
// Deux clés sont acceptées : celle de la régie (toutes les actions) et celle du panneau arbitre
// (arbitre/), limitée au score et au chrono : elle ne peut rien changer à l'antenne.

require __DIR__ . '/etat.php';

$role = role_de($_GET['cle'] ?? $_POST['cle'] ?? '');
if ($role !== 'cle' && $role !== 'arbitre') {
    echec(403, 'Clé invalide');
}

$action = (string) ($_GET['a'] ?? $_POST['a'] ?? '');
if ($role === 'arbitre' && !in_array($action, ['point', 'moins', 'set', 'chrono', 'periode', 'statut', 'tirs', 'etat'], true)) {
    echec(403, 'Action réservée à la régie');
}
$param = function ($k, $defaut = '') { return (string) ($_GET[$k] ?? $_POST[$k] ?? $defaut); };
$t = (int) round(microtime(true) * 1000);
$SPORTS = sports();

// ---------- Calculs du chrono (les mêmes que assets/commun.js) ----------

function sport_de($S) {
    global $SPORTS;
    return $SPORTS[$S['sport']] ?? reset($SPORTS);
}
function periode_de($S) {
    return sport_de($S)['periods'][$S['period']] ?? null;
}
function a_chrono($S) {
    $p = periode_de($S);
    return !empty(sport_de($S)['clock']) && $p && !empty($p['len']);
}
function debut_periode($S, $i) {
    $sp = sport_de($S);
    $p = $sp['periods'][$i] ?? null;
    if (empty($sp['clock']) || !$p) return 0;
    if ($sp['clock'] === 'down') return $p['len'] * 60000;
    $total = 0;
    for ($k = 0; $k < $i; $k++) $total += $sp['periods'][$k]['len'];
    return $total * 60000;
}
function chrono_ms($S, $t) {
    $c = $S['clock'];
    $ms = $c['baseMs'];
    if ($c['running']) {
        $d = $t - $c['startedAt'];
        $ms += sport_de($S)['clock'] === 'down' ? -$d : $d;
    }
    return max(0, $ms);
}
function tirs_ms($S, $t) {
    $ms = $S['shot']['baseMs'];
    if ($S['clock']['running']) $ms -= $t - $S['shot']['startedAt'];
    return max(0, $ms);
}
function minute_jeu($S, $t) {
    if (sport_de($S)['clock'] !== 'up' || !a_chrono($S)) return '';
    $ms = chrono_ms($S, $t);
    $p = periode_de($S);
    $fin = debut_periode($S, $S['period']) + $p['len'] * 60000;
    if ($ms >= $fin) return ($fin / 60000) . '+' . (intdiv($ms - $fin, 60000) + 1) . "'";
    return (intdiv($ms, 60000) + 1) . "'";
}
function format_ms($ms) {
    $s = intdiv($ms, 1000);
    return sprintf('%02d:%02d', intdiv($s, 60), $s % 60);
}

function cote_param($v) {
    if (in_array($v, ['gauche', 'home', 'g', '1'], true)) return 'home';
    if (in_array($v, ['droite', 'away', 'd', '2'], true)) return 'away';
    echec(400, 'equipe=gauche ou equipe=droite');
}

// Modifie un fichier : on relit, on applique, on enregistre ; si une page de la régie a
// enregistré entre-temps, on recommence sur la nouvelle version. $fn renvoie null : rien à faire.
function modifier($f, callable $fn) {
    for ($essai = 0; $essai < 5; $essai++) {
        $actuel = lire_etat($f);
        if ($actuel['state'] === null) {
            echec(409, "Ouvre la régie une première fois : aucune donnée « $f » pour l'instant");
        }
        $etat = $fn($actuel['state']);
        if ($etat === null) return $actuel['state'];
        $nouveau = ecrire_etat($f, $actuel['rev'], $etat, false);
        if ($nouveau) return $nouveau['state'];
        usleep(50000);
    }
    echec(503, 'Trop de modifications en même temps, réessaie');
}

// ---------- Actions ----------

switch ($action) {
    case 'point':
    case 'moins':
        $cote = cote_param($param('equipe'));
        modifier('score', function ($S) use ($action, $cote, $param, $t) {
            $sp = sport_de($S);
            if ($action === 'moins') {
                $S[$cote]['score'] = max(0, $S[$cote]['score'] - entier($param('v', '1'), 1, 99));
                if (!empty($sp['scorers'])) {               // retire le dernier marqueur de l'équipe
                    for ($i = count($S['scorers']) - 1; $i >= 0; $i--) {
                        if ($S['scorers'][$i]['team'] === $cote) { array_splice($S['scorers'], $i, 1); break; }
                    }
                }
                return $S;
            }
            $points = $sp['points'] ?: [['value' => 1, 'label' => 'Point', 'banner' => false]];
            $p = $points[entier($param('type', '0'), 0, count($points) - 1)];
            $minute = minute_jeu($S, $t);
            $S[$cote]['score'] = min(999, $S[$cote]['score'] + $p['value']);
            if (!empty($sp['sets'])) $S['serve'] = $cote;
            if (!empty($p['banner'])) {
                $S['event'] = ['id' => $S['event']['id'] + 1, 'team' => $cote, 'label' => $p['label'], 'player' => '', 'minute' => $minute];
            }
            if (!empty($sp['scorers'])) {
                $S['scorers'][] = ['team' => $cote, 'player' => '', 'minute' => $minute, 'label' => $p['label']];
                $S['scorers'] = array_slice($S['scorers'], -40);
            }
            return $S;
        });
        break;

    case 'set':
        $cote = cote_param($param('equipe'));
        $annule = $param('annule') === '1';
        modifier('score', function ($S) use ($cote, $annule) {
            $cfg = sport_de($S)['sets'] ?? null;
            if (!$cfg) echec(409, 'Pas de sets pour ce sport');
            if ($annule) {                                  // revient au set précédent (scores rétablis)
                if (!$S['history'] || $S[$cote]['sets'] < 1) return null;
                [$h, $a] = array_pop($S['history']);
                $S[$cote]['sets']--;
                $S['home']['score'] = $h;
                $S['away']['score'] = $a;
                return $S;
            }
            $S[$cote]['sets'] = min(9, $S[$cote]['sets'] + 1);
            $S['history'][] = [$S['home']['score'], $S['away']['score']];
            $S['history'] = array_slice($S['history'], -5);
            $S['home']['score'] = $S['away']['score'] = 0;
            $S['event'] = ['id' => $S['event']['id'] + 1, 'team' => $cote,
                'label' => $S[$cote]['sets'] >= $cfg['win'] ? 'Victoire' : 'Set', 'player' => '', 'minute' => ''];
            return $S;
        });
        break;

    case 'chrono':
        $voulu = $param('etat', 'bascule');
        modifier('score', function ($S) use ($voulu, $t) {
            if (!a_chrono($S)) echec(409, 'Pas de chrono pour cette période');
            $marche = $S['clock']['running'];
            if (($voulu === 'marche' && $marche) || ($voulu === 'arret' && !$marche)) return null;
            if ($marche) {
                $S['shot']['baseMs'] = tirs_ms($S, $t);
                $S['clock']['baseMs'] = chrono_ms($S, $t);
                $S['clock']['running'] = false;
            } else {
                $S['clock']['startedAt'] = $S['shot']['startedAt'] = $t;
                $S['clock']['running'] = true;
                $S['status'] = '';
            }
            return $S;
        });
        break;

    case 'periode':
        $n = $param('n', 'suivante');
        modifier('score', function ($S) use ($n) {
            $sp = sport_de($S);
            $nb = count($sp['periods']);
            if (!$nb) echec(409, 'Pas de périodes pour ce sport');
            $i = $n === 'suivante' ? $S['period'] + 1 : ($n === 'precedente' ? $S['period'] - 1 : (int) $n - 1);
            $i = max(0, min($nb - 1, $i));
            if ($i === $S['period']) return null;
            $S['period'] = $i;
            $S['added'] = 0;
            $S['status'] = '';
            $S['clock'] = ['running' => false, 'baseMs' => debut_periode($S, $i), 'startedAt' => 0];
            $S['shot'] = ['baseMs' => !empty($sp['shot']) ? $sp['shot'][0] * 1000 : 0, 'startedAt' => 0];
            if (!empty($sp['fouls'])) $S['home']['fouls'] = $S['away']['fouls'] = 0;
            return $S;
        });
        break;

    case 'statut':
        $v = ['temps' => '', 'mi-temps' => 'ht', 'fin' => 'ft', 'pause' => 'pause'][$param('v', 'temps')] ?? null;
        if ($v === null) echec(400, 'v=temps, mi-temps, fin ou pause');
        modifier('score', function ($S) use ($v) { $S['status'] = $v; return $S; });
        break;

    case 'tirs':
        $sec = entier($param('s', '24'), 1, 60);
        modifier('score', function ($S) use ($sec, $t) { $S['shot'] = ['baseMs' => $sec * 1000, 'startedAt' => $t]; return $S; });
        break;

    case 'element':
        $nom = $param('nom');
        if (!in_array($nom, ELEMENTS_ANTENNE, true) && !preg_match('/^g-[a-z0-9]{1,16}$/', $nom)) {
            echec(400, 'nom=' . implode(', ', ELEMENTS_ANTENNE) . ' ou g-<identifiant>');
        }
        $voulu = $param('etat', 'bascule');
        modifier('antenne', function ($A) use ($nom, $voulu) {
            $cible = $A['studio'] ? 'preview' : 'program';      // mode studio : on prépare à l'aperçu
            $v = $voulu === 'on' ? true : ($voulu === 'off' ? false : empty($A[$cible][$nom]));
            $A[$cible][$nom] = $v;
            if ($v && $nom === 'lower') $A[$cible]['sub'] = false;   // même emplacement à l'écran
            if ($v && $nom === 'sub') $A[$cible]['lower'] = false;
            if (!$A['studio']) $A['preview'] = $A['program'];
            return $A;
        });
        break;

    case 'ecran':
        $type = $param('type', 'pause');
        if (!in_array($type, ['avant', 'pause', 'fin', 'coupure'], true)) echec(400, 'type=avant, pause, fin ou coupure');
        modifier('infos', function ($I) use ($type) {
            if (($I['ecran']['type'] ?? '') === $type) return null;
            $I['ecran']['type'] = $type;
            return $I;
        });
        modifier('antenne', function ($A) {
            $cible = $A['studio'] ? 'preview' : 'program';
            if (!empty($A[$cible]['ecran'])) return null;
            $A[$cible]['ecran'] = true;
            if (!$A['studio']) $A['preview'] = $A['program'];
            return $A;
        });
        break;

    case 'transition':
        $style = $param('style');
        $scene = texte($param('scene'), 60);
        modifier('antenne', function ($A) use ($style, $scene) {
            $A['wipe'] = [
                'id'    => $A['wipe']['id'] + 1,
                'style' => in_array($style, STYLES_TRANSITION, true) ? $style : $A['wipeStyle'],
                'scene' => $scene,
            ];
            return $A;
        });
        break;

    case 'kart':
        $suivre = $param('suivre', null);
        $duel = $param('duel', null);
        modifier('karting', function ($K) use ($suivre, $duel) {
            if ($suivre !== null) $K['focus'] = preg_match('/^\d{1,4}$/', $suivre) ? $suivre : '';
            if ($duel !== null) {
                $d = array_pad(explode(',', $duel), 2, '');
                $K['duel'] = [preg_match('/^\d{1,4}$/', $d[0]) ? $d[0] : '', preg_match('/^\d{1,4}$/', $d[1]) ? $d[1] : ''];
            }
            return $K;
        });
        break;

    case 'prendre':
        modifier('antenne', function ($A) {
            if (!$A['studio']) return null;                 // mode direct : tout est déjà à l'antenne
            $A['program'] = $A['preview'];
            $A['snap'] = [
                'equipes'    => lire_etat('equipes')['state'],
                'infos'      => lire_etat('infos')['state'],
                'graphiques' => lire_etat('graphiques')['state'],
            ];
            $A['take']++;
            return $A;
        });
        break;

    case 'tout_masquer':
        modifier('antenne', function ($A) {
            foreach (['program', 'preview'] as $vue) {
                foreach ($A[$vue] as $k => $on) $A[$vue][$k] = false;
            }
            return $A;
        });
        break;

    case 'etat':
        break;

    default:
        echec(400, 'Action inconnue : point, moins, set, chrono, periode, statut, tirs, element, ecran, transition, kart, prendre, tout_masquer ou etat');
}

// ---------- Réponse : de quoi afficher sur la touche ----------
$S = lire_etat('score')['state'];
if (!$S) repondre(200, ['ok' => true, 'action' => $action]);
$p = periode_de($S);
repondre(200, [
    'ok'      => true,
    'action'  => $action,
    'score'   => $S['home']['score'] . '-' . $S['away']['score'],
    'gauche'  => $S['home']['score'],
    'droite'  => $S['away']['score'],
    'chrono'  => a_chrono($S) ? format_ms(chrono_ms($S, (int) round(microtime(true) * 1000))) : '',
    'periode' => $p['short'] ?? '',
    'marche'  => $S['clock']['running'],
]);
