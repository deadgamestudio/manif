# MANIF — Saisies variées v02

13 octobre 2026. Trois prises demandées : par le col du vêtement, par un bras au niveau du poignet, par une seule jambe au niveau de la cheville. Chaque prise a une phase de saisie et une boucle de maintien/résistance, pour les quatre manifestants approuvés.

## Contenu
Douze duos, soit 24 modèles GLB et sources Blender : douze manifestants et douze variantes CRS appariées. Deux clips par modèle, donc 48 instances. Il s’agit de variantes d’interaction, pas de nouveaux designs de personnages. Ce lot complète le traînage par les deux chevilles v01 et conserve les anciens packs.

Manifestant : seized (2 s, ponctuel), held-loop (1,667 s, boucle). CRS : seize (2 s, ponctuel), hold-loop (1,667 s, boucle). Synchroniser les deux acteurs sur la même horloge. Les saisies col et bras partent debout ; la jambe part d’une pose allongée.

## Contacts et placement
pairs.json donne pour chaque duo le placement du CRS par rapport au manifestant, en coordonnées Blender et glTF. Les positions diffèrent selon la prise. Les clips restent sur place ; déplacer un parent commun et conserver les positions relatives. Les variantes sont ajustées à la morphologie de leur partenaire. Elles ne remplacent pas un système de contraintes dynamiques de gameplay.

La main droite du CRS suit une cible liée au haut du vêtement, au poignet gauche ou à la cheville gauche du manifestant. La main gauche reste libre. Les mains sont des mitaines sans doigts, donc la fermeture sur le tissu ou autour du membre est suggérée. Aucun vêtement ne se déforme sous la traction. Le CRS porte sa matraque à la ceinture et n’a pas de bouclier dans ces variantes.

Contrôle après réimport : squelette de repos, poids, géométrie, budgets, durées et boucles ; 24 vérifications de cibles de poignets. verification-contacts.json mesure l’écart à une cible décalée près de la prise, et non le contact exact des surfaces de peau ou tissu. Les rendus ont été inspectés. Aucun test de collision, de réseau ni de gameplay n’a été effectué.

À raccorder : transitions entre les prises, lâcher, sauvetage, interruption, sol irrégulier, déplacement du duo et choix de variante. Les clips held-loop sont des maintiens sur place ; ils n’ajoutent pas une locomotion spécifique de traînage par le col ou par le bras.

L’issue GitHub reste inchangée et décochée par notre travail.
