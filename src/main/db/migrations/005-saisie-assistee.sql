-- =============================================================================
-- Migration 5 — Saisie assistée des produits
--
-- Le répertoire lui-même ne vit pas ici : c'est un fichier séparé, livré avec
-- le logiciel et ouvert en lecture seule (voir services/repertoire.ts). Cette
-- migration n'ajoute que le réglage dont la saisie a besoin.
--
-- La marge par défaut sert à proposer un prix de vente dès que le prix d'achat
-- est saisi. C'est une proposition, jamais une imposition : le champ reste
-- modifiable, et le pharmacien voit la marge obtenue.
-- =============================================================================

INSERT OR IGNORE INTO parametres (cle, valeur, type, categorie, libelle, description) VALUES
  ('produits.marge_par_defaut', '30', 'entier', 'produits',
   'Marge par défaut proposée',
   'Marge visée sur le prix de vente, utilisée pour proposer un prix lors de la création d''un produit. Zéro désactive la proposition.');
