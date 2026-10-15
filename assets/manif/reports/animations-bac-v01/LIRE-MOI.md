# MANIF — Révélation BAC v01

13 octobre 2026. Les quatre modèles approuvés de manifestants sont réutilisés sans modification de leur apparence. Aucun corps spécifique BAC. Chaque GLB contient le clip armband-reveal, 2,5 secondes, ponctuel. Le brassard POLICE est fourni séparément avec sa source Blender.

## Déclenchement
La main droite rejoint le haut du bras gauche puis revient. Dans la démonstration, le brassard apparaît à l’image 34 à 24 images/s, soit environ 1,375 s après le début du clip. Le jeu doit déclencher cet événement : la visibilité du brassard n’est pas encodée dans les quatre GLB de personnages. Ils ne contiennent pas le brassard, pour conserver le même personnage avant révélation.

## Placement de référence du brassard
Dans le repère Blender du personnage au repos : position (0,23 ; 0 ; 1,26), rotation nulle, échelle uniforme 1,4 pour passer au-dessus de la manche. La démonstration applique aussi l’échelle propre du personnage, puis l’attache à upper_arm_L en conservant sa position. Convertir le repère vers glTF Y vertical et vérifier l’ajustement selon la tenue. Le brassard séparé reste le fichier production-v1 original.

L’apparition du brassard suggère sa mise en place ; ni tissu souple ni manipulation complète d’une boucle ne sont simulés. Les mains sont des mitaines. Une transition courte vers la locomotion est à régler dans le moteur. Les autres animations restent dans les packs manifestants précédents ; ces copies n’embarquent que le nouveau geste.

## Vérification
Quatre GLB réimportés : quatre clips avec durée attendue, squelettes de repos, textures, triangles, poids normalisés et mouvement. Contrôle des aperçus avant et après révélation. Aucun test de gameplay, réseau, changement d’équipe ou détection des BAC.

La règle de l’issue est conservée : les BAC emploient les mêmes personnages que les manifestants. Étendre l’attache aux autres tenues reste à vérifier visuellement. L’issue GitHub n’a pas été cochée.
