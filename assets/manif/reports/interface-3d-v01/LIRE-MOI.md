# MANIF — Interface 3D v01

11 GLB et sources Blender : santé, sauvetage, feu, gaz, sonné, objet en main, marqueur joueur et quatre niveaux de progression (25, 50, 75, 100 %). PNG transparents également fournis.

Les icônes sont des objets à orienter vers la caméra. Le marqueur joueur peut suivre la tête ou être projeté au sol après rotation. La main indique qu’un objet est tenu ; la vignette précise de l’objet doit venir de l’inventaire.

Les quatre anneaux sont des références fixes, pas un widget de progression continue. Les deux matériaux séparent fond et portion active. Prévoir un masque/shader ou une géométrie ajustable pour suivre la vraie progression. Le sauvetage et l’interaction avec le feu peuvent réutiliser ces anneaux avec l’icône correspondante.

Les couleurs ne suffisent pas à distinguer les états : garder les silhouettes et ajouter un libellé si nécessaire. Tester à la résolution et à la distance finales. Aucun HUD, nametag ni logique d’interaction n’est créé ici.


## Vérification
Tous les GLB sont réimportés dans Blender : triangles, nombre d’animations, coordonnées finies à chaque image et raccord des boucles. Les rendus et planches sont examinés. Aucun test moteur ni profilage GPU. Ne pas considérer ces contrôles comme une validation du jeu.

## Repères
Mètres. Blender Z vertical, avant -Y ; glTF Y vertical, avant +Z. Les caméras et éclairages restent dans les sources Blender et ne sont pas exportés. Conserver les couleurs de matériaux ; adapter l’éclairage du moteur.

L’issue 28 reste inchangée.
