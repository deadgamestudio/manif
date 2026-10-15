# MANIF — Moto : bascule et glissade

La moto existante reçoit une chute latérale (bike-tip, 2 s), une pose couchée avec petite oscillation (bike-slide, boucle de 1,5 s), et un état couché fixe (bike-tipped). 3 GLB et leurs sources Blender. Les 1 648 triangles du véhicule sont conservés.

La boucle de glissade est sur place : le jeu doit déplacer le groupe sur le sol. La chute recale la hauteur à chaque image pour que le volume ne passe pas sous le sol plat ; il s’agit d’une animation écrite, pas d’une simulation. Roues non articulées et non animées dans ces fichiers. Chute des passagers, vitesse horizontale, collisions, terrain irrégulier et synchronisation restent à raccorder.

Les marqueurs de siège sont conservés dans le GLB. Ne pas laisser les passagers attachés aux sièges après leur éjection. Les animations BRAV restent dans animations-brav-v01. Les GIF répètent la chute pour la regarder ; bike-tip se joue une fois en jeu.

## Vérification
Réimportation des GLB et contrôle des triangles, coordonnées et animations lorsqu’elles sont présentes. Pour la moto : contact sol et raccord de boucle contrôlés. Pour les décors : dimensions et textures embarquées contrôlées. Aperçus examinés. Aucun test de gameplay, de réseau ou de performance moteur. L’issue 28 reste inchangée.
