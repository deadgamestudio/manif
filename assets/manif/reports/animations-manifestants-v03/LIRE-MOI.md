# MANIF — Animations manifestants v03

13 octobre 2026. Six nouveaux mouvements sur les quatre manifestants validés. Les treize clips précédents sont conservés : chaque GLB contient 19 clips, soit 76 instances de clips au total.

## Fichiers
Quatre GLB complets et quatre sources Blender ; 20 GIF de revue (19 mouvements + portage à deux repris de v02), images fixes, galerie, manifeste et rapport de vérification. Les copies v01 et v02 restent intactes. La scène Blender de présentation du portage à deux est disponible dans le pack v02, pas dans cette archive.

## Nouveaux clips
| Clip | Durée | Lecture et usage |
| --- | --- | --- |
| clumsy-dive | 2 s | ponctuel, plongeon puis retour debout |
| melee-swing | 1,25 s | ponctuel, geste de mêlée main droite |
| gas-cough | 2 s | boucle, toux et affaissement |
| rescue-pull | 1,667 s | boucle, traction à deux mains |
| pat-out | 1,333 s | boucle, tapotements alternés vers l’avant |
| on-fire-run | 0,833 s | boucle, course affolée bras levés |

## Raccordement au jeu
Les déplacements sont pilotés par le contrôleur du jeu, pas par les clips. Le plongeon est animé sur place ; choisir son déplacement horizontal selon le gameplay. Il inclut son propre retour debout et ne doit pas être suivi directement du get-up sur le dos de v02. Adapter le clip si le gameplay exige une interruption au sol ou un ragdoll.

Le geste melee-swing ne contient ni arme ni impact : point de synchronisation indicatif à 0,69 s, à régler avec la portée et le système de contact. Les effets de gaz, de flammes et de coups sont absents.

rescue-pull et pat-out sont des gestes de l’acteur seul. Le placement du partenaire, la portée, les contacts des mains et la synchronisation réseau restent à implémenter. rescue-pull n’est pas encore une animation complète de traînage par les chevilles. Aucun effet réel d’extinction, de sauvetage ou de dégâts n’est codé.

on-fire-run reprend le cycle de jambes de panic-run ; adapter sa vitesse de lecture à celle du contrôleur. Les conventions des treize clips précédents sont reprises dans CONVENTIONS-V01.md et CONVENTIONS-V02.md.

Les personnages et leurs squelettes de repos sont inchangés. GLB en mètres, Y vertical, face +Z ; sources Blender Z vertical. Portage passager : conserver l’exception de pivot décrite dans les conventions v02.

## Contrôles et limites
Réimport des quatre GLB : 19 clips et durées attendues, textures embarquées, triangles et squelette de repos inchangés, poids normalisés, coordonnées finies et mouvement vérifié sur chaque clip, raccord des boucles et contrôle du sol. Inspection visuelle des poses rendues. Il s’agit d’une première passe stylisée ; les contacts et intersections en situation doivent être affinés dans le moteur. Aucun test du client, du réseau, de collision ou de performance moteur n’a été réalisé.

## Suite de l’issue #28
Restent notamment les gestes spécialisés CRS, grenadier, BRAV-M, BAC et pompier, le traînage avec partenaire, l’arrestation dans le fourgon, les effets et l’intégration. Cette livraison ne clôture pas l’issue.
