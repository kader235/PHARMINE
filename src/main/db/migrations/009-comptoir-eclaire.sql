-- =============================================================================
-- Migration 9 — Un comptoir qui montre ce qu'il sait
--
-- Le pharmacien décide en trois secondes, client devant. Jusqu'ici il voyait le
-- nom, le stock et le prix ; le reste était dans une autre fiche, donc perdu.
--
-- Deux choses lui manquaient vraiment :
--
--   LA PÉREMPTION. La vue la calculait déjà, personne ne l'affichait. Servir
--   une boîte qui expire dans trois semaines à quelqu'un qui part en voyage,
--   c'est une boîte qui reviendra — ou pire, qui ne reviendra pas.
--
--   LES ÉQUIVALENTS. Une rupture n'est pas une vente perdue s'il existe la même
--   molécule sous un autre nom. Le catalogue le sait ; il ne le disait pas.
--
-- POURQUOI UNE COLONNE NORMALISÉE PLUTÔT QU'UNE COMPARAISON DIRECTE
--
-- Le principe actif est saisi à la main, par des gens différents, au fil des
-- années : « Paracétamol », « paracetamol », « PARACÉTAMOL  ». Ce sont les
-- mêmes molécules et il faut les rapprocher.
--
-- Or LOWER() de SQLite ne descend que l'ASCII : « PARACÉTAMOL » devient
-- « paracÉtamol », qui ne vaut pas « paracétamol ». Comparer ainsi aurait
-- silencieusement raté la moitié des équivalents — et un équivalent manqué ne
-- se voit pas, contrairement à un équivalent faux.
--
-- On range donc à côté une forme normalisée, sans accents ni casse, calculée
-- par le logiciel à chaque écriture. Le rapprochement devient exact et
-- indexable.
-- =============================================================================

ALTER TABLE produits ADD COLUMN principe_actif_norme TEXT;

-- Rattrapage de l'existant. Le logiciel recalculera proprement à la prochaine
-- modification de chaque fiche ; cette chaîne couvre les accents du français,
-- qui suffisent au catalogue pharmaceutique.
UPDATE produits
SET principe_actif_norme = LOWER(TRIM(
  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    principe_actif,
    'À','a'),'Â','a'),'Ä','a'),'à','a'),'â','a'),'ä','a'),
    'É','e'),'È','e'),'Ê','e'),'Ë','e'),'é','e'),'è','e'),
    'ê','e'),'ë','e'),'Î','i'),'Ï','i'),'î','i'),'ï','i'),
    'Ô','o'),'Ö','o'),'ô','o'),'ö','o'),'Ç','c'),'ç','c')
))
WHERE principe_actif IS NOT NULL AND TRIM(principe_actif) <> '';

CREATE INDEX IF NOT EXISTS idx_produits_principe_norme
  ON produits (principe_actif_norme)
  WHERE principe_actif_norme IS NOT NULL AND archived_at IS NULL;

-- La vue du comptoir expose désormais la molécule et sa forme normalisée.
DROP VIEW IF EXISTS v_produit_etat;

CREATE VIEW v_produit_etat AS
SELECT
  p.id, p.code_interne, p.nom_commercial, p.nom_generique, p.dosage,
  p.principe_actif, p.principe_actif_norme,
  p.prix_vente, p.prix_achat, p.stock_min, p.emplacement, p.ordonnance_requise,
  p.vente_autorisee, p.archived_at,
  c.nom  AS categorie,
  f.nom  AS forme,
  lb.nom AS laboratoire,
  u.abbreviation AS unite,
  s.stock, s.stock_disponible, s.valeur_achat, s.prochaine_peremption, s.lots_actifs,
  CASE
    WHEN s.stock_disponible <= 0            THEN 'rupture'
    WHEN s.stock_disponible <= p.stock_min  THEN 'faible'
    WHEN p.stock_max IS NOT NULL
         AND s.stock_disponible > p.stock_max THEN 'surstock'
    ELSE 'disponible'
  END AS etat_stock
FROM produits p
LEFT JOIN v_stock_produit s ON s.produit_id = p.id
LEFT JOIN categories   c  ON c.id  = p.categorie_id
LEFT JOIN formes       f  ON f.id  = p.forme_id
LEFT JOIN laboratoires lb ON lb.id = p.laboratoire_id
LEFT JOIN unites       u  ON u.id  = p.unite_id;
