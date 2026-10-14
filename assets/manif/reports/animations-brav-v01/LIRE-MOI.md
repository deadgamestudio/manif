# MANIF — BRAV-M v01

13 octobre 2026. Deux personnages animés avec leur équipement existant et la moto production-v1, livrée à l’identique. Trois GLB, leurs sources Blender et quatre GIF montrant l’assemblage.

## Clips
- Conducteur : riding (2 s, boucle), fall-off (2 s, ponctuel).
- Passager : riding (2 s, boucle), dismount (2,5 s, ponctuel), fall-off (2 s, ponctuel).

Cinq instances de clips, avec une conduite commune et deux chutes adaptées. La moto conserve sa géométrie initiale, ses roues ne sont pas animées et elle reste debout dans les démonstrations. La chute est celle du personnage ; le renversement et la glissade de la moto ne sont pas réalisés dans ce lot.

## Placement et racine
Placer les deux personnages et la moto à la même origine, sans réappliquer les anciennes translations de production-v1. Les décalages vers les selles sont déjà enregistrés dans les os hips des nouveaux clips. La racine objet reste fixe. Pour la conduite, déplacer un parent commun avec la moto.

dismount et fall-off comprennent un déplacement local du bassin hors de la moto. Cela impose un transfert de position vers le contrôleur au moment de quitter l’animation : sans ce transfert, le personnage reviendra à son ancienne origine en passant sur un clip de marche. Ce comportement est à intégrer explicitement. La descente comporte un petit bond latéral ; elle ne calcule pas les obstacles.

La posture de conduite du conducteur rapproche les poignets de cibles au guidon. Les poses sont enregistrées et ne nécessitent pas de solveur dans le GLB. handlebar-contact.json indique le contrôle de création des cibles, pas une certification de contact précis des doigts après export. Mitaines, selle, repose-pieds et transitions demandent encore une passe d’ajustement dans le moteur. Les mouvements de chute sont chorégraphiés et ne remplacent pas un ragdoll.

## Vérification
Réimport des deux personnages : cinq clips, durées, boucles, textures embarquées, triangles et squelette de repos conservés, géométrie finie, poids normalisés et mouvement effectif. Inspection visuelle de l’assemblage avec la moto. Aucun test de conduite, de physique, de collision ou de réseau en jeu.

Les sources précédentes sont conservées. Le lot ne clôture pas l’issue GitHub. Restent notamment la révélation BAC, des compléments de réactions/actions, les effets et l’intégration.
