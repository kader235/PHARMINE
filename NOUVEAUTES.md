# Nouveautés de PHARMINA

Ce fichier n'est pas un journal de développement. C'est **ce que lit le
pharmacien** dans la fenêtre de mise à jour, sur son comptoir, entre deux
clients.

Trois règles, apprises d'une version publiée avec un message de commit à la
place de ces lignes :

1. **Dix lignes au maximum, aucune de plus de deux cents caractères.** Au-delà,
   le logiciel refuse d'afficher et se contente d'annoncer la version — mieux
   vaut ne rien dire que noyer.
2. **Aucun terme de métier informatique.** Ni « migration », ni « schéma », ni
   « vérifications ». Ce qui change pour lui, en français.
3. **Ce qu'il gagne, pas ce qui a été codé.** « Le comptoir affiche où trouver
   la boîte » plutôt que « ajout du champ emplacement à la vue produit ».

Le titre de chaque section doit être `## <version>`, exactement : c'est ainsi
que `npm run notes` retrouve la bonne.

## 0.1.3

Le comptoir en dit plus, et l'étiquetage devient possible.

• En cherchant un produit, vous voyez où le trouver dans l'officine, dans
combien de temps il périme, et par quoi le remplacer s'il en manque.
• Un produit s'enregistre maintenant en six champs, depuis l'écran Produits.
• Les boîtes sans code-barres peuvent en recevoir un : le logiciel le fabrique
et l'imprime, dix étiquettes par feuille.
• Si vos données deviennent illisibles, le logiciel vous propose la dernière
sauvegarde au lieu de se fermer.

## 0.1.2

Version technique. Les nouveautés sont décrites dans le guide, touche F1.

## 0.1.1

Correction de l'affichage du tableau de bord à l'impression.
