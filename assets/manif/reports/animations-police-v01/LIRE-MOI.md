# MANIF — Animations police v01

13 octobre 2026. Trois modèles équipés issus du pack production-v1 : CRS, CRS avec visière tachée, grenadier. Sept mouvements distincts, onze instances de clips réparties entre trois GLB. Les sources Blender, sept GIF, leurs images fixes et une galerie sont inclus.

## Répartition
- crs : guard-idle (2 s), formation-walk (1,667 s), shield-raise (1 s), shield-shove (1,25 s), baton-swing (1,25 s).
- crs-splatted : guard-idle (2 s), formation-walk (1,667 s), visor-wipe (2,5 s).
- crs-grenadier : guard-idle (2 s), formation-walk (1,667 s), canister-throw (1,5 s).

Seuls guard-idle et formation-walk sont à boucler. Les autres gestes sont ponctuels ; les GIF les répètent pour la revue. Le grenadier utilise la garde sans bouclier avec sa cartouche en main.

## Équipements
Les maillages et squelettes de repos sont conservés. Les équipements sont sélectionnés avec leur armature lors de l’export. Pour la variante crs-splatted, la matraque est désormais rangée derrière la hanche et attachée à hips, afin de libérer la main droite pour l’essuyage. Ce changement est propre à cette copie ; le pack production-v1 reste intact.

La tache ne disparaît pas automatiquement pendant visor-wipe. Le jeu doit masquer ou remplacer son mesh au moment choisi ; le clip ne modifie pas les matériaux. L’essuyage est un geste approximatif à affiner selon le contact avec la visière.

canister-throw ne lance pas physiquement la cartouche, qui reste attachée à la main dans le GLB et le GIF. Le client doit retirer cet accessoire au relâchement, puis créer son projectile avec sa propre physique. Repère de départ proposé : 0,85 s.

## Raccordement
Marche sur place : déplacement fourni par le contrôleur ; vitesse de départ suggérée 0,456 m/s à échelle 1, à adapter avec la vitesse de lecture. shield-raise part bouclier abaissé et finit dans la garde ; jouer en sens inverse pour l’abaisser. shield-shove et baton-swing reviennent vers la garde, avec transitions courtes à régler dans le moteur.

Repères indicatifs de contact : poussée vers 0,625 s, matraque vers 0,71 s. Aucun événement ni dégâts, interaction de formation ou collision ne sont encodés. Les mains, le bouclier et la matraque peuvent demander des ajustements supplémentaires lors des mélanges d’animations.

GLB : mètres, Y vertical, face +Z. Blender : Z vertical. Squelettes de repos communs conservés. Ces fichiers remplacent les ébauches précédentes de ces trois modèles ; ils ne contiennent pas les dix-neuf animations de manifestants ni les poses BRAV-M.

## Vérification et limites
Réimport des trois GLB : noms et durées des onze clips, textures embarquées, nombre de triangles et squelette de repos conservés, poids normalisés du corps, coordonnées finies à chaque image, mouvement et raccord des boucles. Contrôle visuel de face et de profil avec équipements. Ces contrôles ne certifient pas les contacts physiques ni l’absence de toutes les intersections. Aucun test moteur, réseau ou de performance en jeu n’a été exécuté.

La suite de l’issue #28 comprend encore le traînage avec partenaire, les interactions BRAV-M, BAC, pompier et fourgon, les effets et l’intégration. Ce lot ne clôture pas l’issue.
