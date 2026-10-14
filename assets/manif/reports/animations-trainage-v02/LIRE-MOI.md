# MANIF — Traînage au sol v02

13 octobre 2026. Trois modes de traînage au sol : col du vêtement, un bras et une jambe. Chacun est décliné pour les quatre manifestants. Ce lot complète le traînage par les deux chevilles déjà livré dans animations-trainage-v01 et les prises debout de animations-saisies-v02.

## Contenu
12 duos : 24 GLB individuels et leurs sources Blender, 48 instances de clips, 24 GIF et images fixes. Trois scènes de démonstration Blender demo-sol-collar, demo-sol-arm et demo-sol-leg montrent le hoodie avec un CRS, sous deux angles et avec le déplacement du groupe animé.

## Animation
Manifestant : ground-grabbed (2 s, prise au sol), ground-dragged (1,667 s, boucle). CRS : ground-grab (2 s), ground-drag (1,667 s, boucle). Les prises commencent avec le manifestant déjà au sol. Pour le bras, le bras gauche est déjà tendu vers la tête afin de permettre la prise ; la transition depuis une autre pose reste à raccorder.

Chaque GIF de traînage fait reculer le groupe sur un sol marqué. Ce déplacement de présentation n’est pas intégré dans les GLB individuels : le contrôleur doit déplacer leur parent commun. Les trois scènes de démonstration Blender incluent ce déplacement. Les pieds du CRS marchent en reculant ; le manifestant glisse au sol avec une réaction du membre libre.

pairs.json décrit les variantes et les positions relatives, en axes Blender et glTF. Garder le décalage pendant le déplacement du duo. Départ proposé : environ 0,24 à 0,27 m/s sur sol plat, à régler avec la vitesse de lecture. Les déplacements de la galerie sont répétés par GIF ; le retour au point de départ est un redémarrage de l’aperçu.

## Contacts et limites
La main droite suit une cible proche du vêtement, du poignet ou de la cheville. Le corps repose sur son volume, parfois sur son sac ; il ne s’agit pas d’une simulation physique ni d’un sac souple. Les mitaines n’ont pas de doigts articulés et les habits ne s’étirent pas. Le CRS utilise une variante sans bouclier, matraque à la ceinture.

Contrôles après réimport : 24 modèles, 48 clips, durées et boucles, textures, squelettes, budgets, poids normalisés, coordonnées finies ; 24 contrôles des cibles de poignets pendant la phase de contact. Les distances portent sur une cible décalée, pas sur l’intersection réelle des surfaces. Aperçus examinés. Aucun test moteur, collision, ragdoll ou réseau.

À intégrer : transition depuis la chute, déplacement collectif, collision du corps contre le décor, terrain irrégulier, lâcher, interruption, sauvetage et synchronisation réseau. Les poses très basses du CRS sont une première passe caricaturale à affiner avec la vitesse finale du jeu.

L’issue GitHub reste inchangée.
