# MANIF — Animations pompier v01

13 octobre 2026. Un pompier équipé de sa lance détaillée, quatre clips en boucle, un GLB autonome, sa source Blender et quatre aperçus animés de face et de profil.

## Clips
| Nom | Durée | Usage |
| --- | --- | --- |
| hose-ready | 2 s | attente, lance tenue |
| hose-walk | 1,667 s | marche sur place avec la lance |
| hose-spray | 2 s | maintien de la lance avec léger mouvement de recul |
| hose-sweep | 3 s | balayage horizontal |

Le mouvement n’active aucun effet. Ajouter le jet d’eau, le tuyau flexible et l’extinction dans le client du jeu. La vitesse de marche indicative du squelette à échelle 1 est 0,456 m/s ; synchroniser déplacement du contrôleur et lecture du clip.

## Équipement et attache
Le corps, le casque et le squelette de repos proviennent du pompier production-v1. Sa petite lance simplifiée a été remplacée par le modèle fire-nozzle déjà livré. Elle est attachée à hand_L. La main droite est animée pour soutenir l’arrière de la lance ; les rotations sont enregistrées dans le GLB et ne nécessitent pas le solveur utilisé pour les créer.

Le node water-outlet, enfant de fire-nozzle-held, donne l’origine du jet. La direction suit l’axe longitudinal de la lance (axe Z de son maillage Blender). Pour éviter toute confusion d’axes après conversion glTF, transformer en monde le point local de sortie et un second point situé un peu plus loin sur cet axe lors de l’intégration. Ne pas appliquer directement un vecteur global constant.

Les mitaines n’ont pas de doigts articulés. Les contacts constituent une première passe visuelle, à affiner lors des transitions, changements de cible et contacts avec le tuyau. Le corps est conservé ; le nombre total de triangles diffère de production-v1 en raison du remplacement de la lance. Il reste inférieur à 3 000.

GLB en mètres, Y vertical, face +Z ; source Blender Z vertical. Le GLB ne contient que ces quatre boucles et remplace les anciennes ébauches dans cette nouvelle copie. Les sources production-v1 restent intactes.

## Vérification
Réimport GLB : quatre clips et durées attendues, textures embarquées, budget de triangles, présence de water-outlet, squelette de repos inchangé, poids du corps normalisés, coordonnées finies, mouvement et raccord des boucles. Inspection des rendus avec la lance. Aucun test moteur, collision, réseau ou extinction réelle n’a été exécuté.

## Suite de l’issue #28
Restent les interactions BRAV-M, BAC, traînage avec partenaire et fourgon, les effets et l’intégration des lots. L’issue complète reste ouverte.
