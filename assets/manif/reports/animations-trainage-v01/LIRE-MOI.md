# MANIF — Saisie et traînage v01

13 octobre 2026. Quatre interactions appariées : un CRS et chacun des quatre manifestants approuvés. Huit GLB et leurs sources Blender, seize instances de clips (deux par fichier), huit GIF de revue et images fixes. Ce lot est complémentaire des packs précédents ; il ne les remplace pas.

## Mouvements et synchronisation
| Rôle | Saisie, 2 s | Traînage, boucle 1,667 s |
| --- | --- | --- |
| Manifestant | grabbed | dragged-loop |
| CRS | grab-ankles | drag-backward |

Le manifestant commence déjà allongé sur le dos. Sa chute n’est pas incluse dans grabbed ; employer la chute du lot manifestants puis faire une transition. La saisie comporte une approche des mains, puis le soulèvement des jambes. Synchroniser les deux actions sur la même horloge. Prise de contact proposée vers 0,9 s ; passage au traînage à 2 s avec une courte transition à régler dans le moteur.

Quatre mouvements de rôle distincts sont déclinés pour quatre paires ; il ne s’agit pas de seize gestes différents. Chaque variante CRS est ajustée à la taille de son partenaire. Le jeu devra choisir la bonne paire, ou remplacer ces ajustements par des contraintes dynamiques.

## Placement de référence
Dans Blender, le manifestant est à l’origine et le CRS à (0, -1,2, 0), tourné de 180° autour de Z. Dans glTF, placer le CRS à (0, 0, 1,2), tourné de 180° autour de Y. pairs.json fournit les associations et transformations.

Les clips restent sur place. Déplacer un parent commun pour le recul du duo, tout en conservant leurs positions relatives ; ne pas déplacer le CRS indépendamment du manifestant. Vitesse de départ suggérée : 0,24 m/s, à adapter à la vitesse de lecture et au gameplay. Le manifeste décrit les durées, pas les callbacks du jeu.

Le CRS n’a pas de bouclier dans cette variante et porte sa matraque à la ceinture pour utiliser ses deux mains. Le jeu doit changer d’équipement ou de variante au bon moment ; cette transition n’est pas animée. Les corps et squelettes de repos sont conservés.

## Contacts et limites
Les rotations des bras du CRS sont enregistrées après résolution des cibles de poignets proches des chevilles. Les contacts sont approximatifs : mitaines sans doigts, vêtements rigides et sac pouvant porter le poids du personnage au sol. Il n’y a ni simulation de tissus ni contact physique contraint avec les chevilles.

Le contrôle de contact mesure les poignets contre des cibles décalées de 5 cm vers le CRS et de 7,5 cm au-dessus des chevilles. Il ne mesure pas la surface exacte des paumes. Ce contrôle est effectué après réimport des GLB, sur la fin de la saisie et sur tout le cycle de traînage. Voir verification-contacts.json.

Les poses supposent un sol plat. Obstacles, escaliers, lâcher, interruption par un autre joueur, ragdoll et synchronisation réseau restent à implémenter. Une poussée de secours complète à plusieurs personnages n’est pas comprise dans ce lot.

## Vérification
Huit GLB réimportés : clips et durées, textures embarquées, squelettes de repos, budgets de triangles, poids normalisés, géométrie finie à chaque image, mouvement et raccord des boucles. Huit vérifications de contact apparié après export. Contrôle des aperçus sous deux angles. Aucun test dans le moteur du jeu.

L’issue GitHub n’a pas été modifiée. Prochaines familles restantes : BRAV-M, révélation BAC, compléments d’actions, effets, assemblage et validation dans le jeu.
