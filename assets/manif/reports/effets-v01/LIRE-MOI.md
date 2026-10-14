# MANIF — Effets v01

10 effets : gaz, fumée, puanteur, poussière de choc, flammes, fessier en feu, eau, étoiles, tomate et éclair de contact. 10 GLB, 9 animations en transformations d’objets, 10 sources Blender. 9 atlas RGBA de 12 images (2048 × 1536), plus l’image transparente de tomate.

Les nuages GLB sont des volumes opaques stylisés. Les atlas ont un fond transparent, mais leurs particules restent opaques ; ajouter une disparition progressive et régler leur opacité dans le moteur. Les petites particules se recyclent à taille quasi nulle : une transition douce pourra améliorer la version finale. Éviter d’empiler de nombreux GLB de nuages ; privilégier les atlas pour une foule.

Les atlas se lisent de gauche à droite, puis de haut en bas ; atlas.json donne les rectangles et la cadence. Aucun script moteur ni shader n’est fourni. Hit-flash et impact-puff se jouent une seule fois ; les GIF les répètent uniquement pour présentation.

Jet : origine sur la sortie de lance, avant +Z glTF. Il représente des gouttelettes ; collision, portée réglable et ruban continu restent à développer. Les étoiles s’attachent au-dessus du crâne. La tomate est un relief frontal à placer sur une surface, pas un système de décal. Les flammes ne provoquent aucun dégât par elles-mêmes.

Une vignette PNG gaz-écran (1920 × 1080) complète le lot : superposer en plein écran, opacité réglable, sans l’utiliser comme obstacle permanent à la lecture.


## Vérification
Tous les GLB sont réimportés dans Blender : triangles, nombre d’animations, coordonnées finies à chaque image et raccord des boucles. Les rendus et planches sont examinés. Aucun test moteur ni profilage GPU. Ne pas considérer ces contrôles comme une validation du jeu.

## Repères
Mètres. Blender Z vertical, avant -Y ; glTF Y vertical, avant +Z. Les caméras et éclairages restent dans les sources Blender et ne sont pas exportés. Conserver les couleurs de matériaux ; adapter l’éclairage du moteur.

L’issue 28 reste inchangée.
