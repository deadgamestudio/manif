# MANIF — Animations manifestants v04

5 mouvements × 4 personnages = 20 instances de clips. Ce pack complète v03 ; il ne remplace pas ses 19 animations.

- light-fire : 2,5 s, se baisse puis effectue un petit geste des mains. Aucun outil, feu ou recette n’est inclus dans ce geste de jeu.
- gas-stagger : 2 s en boucle, pas courts, corps qui oscille et main proche du visage. À associer au nuage et à une vitesse réduite.
- tomato-stumble : 1,75 s, recul de surprise puis geste d’essuyage. Aucun changement de texture automatique.
- overhead-toss : 1,667 s, départ bras levés, préparation, poussée puis retour. Pose de départ à raccorder au portage ; vérifier l’alignement des mains pendant le mélange des clips. Le personnage porté n’est pas animé dans ce fichier.
- ko-collapse : 2 s, chute suivie d’un relâchement de la tête et des bras ; reste au sol en fin de clip, sans se relever. Alternative provisoire au ragdoll.

events.json fournit des repères suggérés à 24 images/s : allumage image 40, lâcher image 20, tomate image 3. Ce sont des données à raccorder : elles ne déclenchent aucun événement dans les GLB. Pour le lancer, détacher le personnage porté au moment du lâcher, puis déclencher air-flail et le mouvement physique dans le moteur.

Squelettes, couleurs et géométrie conservés. Contrôle des quatre GLB après réimport : 20 clips, durées, poids normalisés, mouvement, absence de passage sous le sol et raccord de la boucle. Les GIF montrent plusieurs angles ; les gestes ponctuels se répètent uniquement pour inspection.

Première passe d’animation, sans contraintes physiques, outils en main, synchronisation réseau ni test moteur. Les poses et événements doivent être ajustés au rythme final. L’issue GitHub reste inchangée.
