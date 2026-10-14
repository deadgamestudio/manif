# MANIF — Santé et états des joueurs

9 nouveaux éléments complètent interface-3d-v01 : barres de vie à 0, 25, 50, 75 et 100 %, icônes saisi, arrêté et KO, anneau au sol du joueur local.

Les barres sont des références fixes. En jeu, déplacer le bord droit du remplissage tout en gardant le bord gauche fixe ; la valeur réelle et les transitions appartiennent au HUD du client. Les PNG ont un fond transparent. Les icônes regardent vers +Z glTF ; le marqueur joueur est posé sur le plan XZ, rayon 0,48 m. Rehausser légèrement le marqueur en cas de conflit visuel avec le sol.

Ces éléments complètent le pack précédent, ils ne le remplacent pas. Aucun changement du HUD du jeu ; aucun nametag supplémentaire. Les états sont reconnus par leur silhouette, sans dépendre seulement de la couleur.

## Vérification
Réimportation des GLB et contrôle des triangles, coordonnées et animations lorsqu’elles sont présentes. Pour la moto : contact sol et raccord de boucle contrôlés. Pour les décors : dimensions et textures embarquées contrôlées. Aperçus examinés. Aucun test de gameplay, de réseau ou de performance moteur. L’issue 28 reste inchangée.
