-- =============================================================================
-- PHARMINA — Référentiel de base
--
-- Contient uniquement ce qu'un logiciel de pharmacie doit connaître avant
-- la première utilisation : rôles, permissions, formes pharmaceutiques,
-- unités, catégories de dépenses.
--
-- Aucune donnée d'exemple. Pas de faux produit, pas de faux fournisseur,
-- pas de faux client. Une base neuve est vide, et les écrans le disent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Rôles
-- -----------------------------------------------------------------------------
INSERT OR IGNORE INTO roles (id, code, nom, description, systeme) VALUES
  (1, 'administrateur', 'Administrateur', 'Accès complet au logiciel, y compris la sécurité et les paramètres.', 1),
  (2, 'pharmacien',     'Pharmacien',     'Accès aux fonctions professionnelles : ventes, stock, achats, inventaire, rapports.', 1),
  (3, 'caissier',       'Caissier',       'Accès limité aux ventes et à la caisse.', 1),
  (4, 'gestionnaire',   'Gestionnaire',   'Consultation des données, finances et rapports, sans opération de caisse.', 1);

-- -----------------------------------------------------------------------------
-- Permissions
-- -----------------------------------------------------------------------------
INSERT OR IGNORE INTO permissions (code, module, libelle, description, ordre) VALUES
  ('tableau_bord.voir',        'Tableau de bord', 'Consulter le tableau de bord',       NULL, 10),

  ('ventes.creer',             'Ventes', 'Enregistrer une vente',                       NULL, 20),
  ('ventes.remise',            'Ventes', 'Appliquer une remise',                        'Sans cette permission, le champ remise est en lecture seule.', 21),
  ('ventes.credit',            'Ventes', 'Vendre à crédit',                             'Autorise une vente dont le reste à payer est supérieur à zéro.', 22),
  ('ventes.annuler',           'Ventes', 'Annuler une vente',                           'L''annulation restitue le stock et trace l''opération.', 23),
  ('ventes.historique',        'Ventes', 'Consulter l''historique des ventes',           NULL, 24),

  ('caisse.ouvrir',            'Caisse', 'Ouvrir la caisse',                            NULL, 30),
  ('caisse.cloturer',          'Caisse', 'Clôturer la caisse',                          NULL, 31),
  ('caisse.mouvement',         'Caisse', 'Enregistrer une entrée ou sortie de caisse',  NULL, 32),
  ('caisse.corriger',          'Caisse', 'Corriger un mouvement de caisse',             'Opération sensible, systématiquement journalisée.', 33),
  ('caisse.ecarts',            'Caisse', 'Consulter les écarts de caisse',              NULL, 34),

  ('produits.voir',            'Produits', 'Consulter le catalogue',                    NULL, 40),
  ('produits.creer',           'Produits', 'Créer un produit',                          NULL, 41),
  ('produits.modifier',        'Produits', 'Modifier un produit',                       NULL, 42),
  ('produits.prix',            'Produits', 'Modifier les prix',                         'Distincte de la modification simple : un changement de prix est tracé.', 43),
  ('produits.archiver',        'Produits', 'Archiver un produit',                       NULL, 44),

  ('stock.voir',               'Stock', 'Consulter le stock',                           NULL, 50),
  ('stock.entree',             'Stock', 'Enregistrer une entrée de stock',              NULL, 51),
  ('stock.sortie',             'Stock', 'Enregistrer une sortie de stock',              NULL, 52),
  ('stock.ajuster',            'Stock', 'Ajuster le stock',                             'Correction manuelle : exige un motif.', 53),
  ('stock.bloquer_lot',        'Stock', 'Bloquer ou débloquer un lot',                  'Rappel de lot, suspicion de non-conformité.', 54),

  ('achats.voir',              'Achats', 'Consulter les achats',                        NULL, 60),
  ('achats.creer',             'Achats', 'Créer une commande ou une réception',         NULL, 61),
  ('achats.valider',           'Achats', 'Valider une réception',                       'La validation met le stock à jour et crée les lots.', 62),
  ('achats.payer',             'Achats', 'Enregistrer un paiement fournisseur',         NULL, 63),

  ('fournisseurs.voir',        'Fournisseurs', 'Consulter les fournisseurs',            NULL, 70),
  ('fournisseurs.gerer',       'Fournisseurs', 'Créer et modifier un fournisseur',      NULL, 71),

  ('clients.voir',             'Clients', 'Consulter les clients',                      NULL, 80),
  ('clients.gerer',            'Clients', 'Créer et modifier un client',                NULL, 81),
  ('clients.reglement',        'Clients', 'Encaisser un règlement de créance',          NULL, 82),

  ('inventaire.voir',          'Inventaire', 'Consulter les inventaires',               NULL, 90),
  ('inventaire.creer',         'Inventaire', 'Ouvrir une session d''inventaire',         NULL, 91),
  ('inventaire.compter',       'Inventaire', 'Saisir un comptage',                      NULL, 92),
  ('inventaire.valider',       'Inventaire', 'Valider un inventaire',                   'La validation ajuste le stock selon les écarts constatés.', 93),

  ('finances.voir',            'Finances', 'Consulter les finances',                    NULL, 100),
  ('depenses.voir',            'Finances', 'Consulter les dépenses',                    NULL, 101),
  ('depenses.creer',           'Finances', 'Enregistrer une dépense',                   NULL, 102),
  ('depenses.archiver',        'Finances', 'Archiver une dépense',                      NULL, 103),

  ('rapports.voir',            'Rapports', 'Consulter les rapports',                    NULL, 110),
  ('rapports.exporter',        'Rapports', 'Exporter et imprimer un rapport',           NULL, 111),

  ('alertes.voir',             'Alertes', 'Consulter les alertes',                      NULL, 120),
  ('alertes.traiter',          'Alertes', 'Marquer une alerte comme traitée',           NULL, 121),

  ('utilisateurs.voir',        'Utilisateurs', 'Consulter les utilisateurs',            NULL, 130),
  ('utilisateurs.gerer',       'Utilisateurs', 'Créer et modifier un utilisateur',      NULL, 131),
  ('utilisateurs.permissions', 'Utilisateurs', 'Modifier les rôles et permissions',     'Permission la plus sensible du logiciel.', 132),

  ('journal.voir',             'Journal', 'Consulter le journal d''activité',            NULL, 140),

  ('parametres.voir',          'Paramètres', 'Consulter les paramètres',                NULL, 150),
  ('parametres.modifier',      'Paramètres', 'Modifier les paramètres',                 NULL, 151),
  ('sauvegardes.creer',        'Paramètres', 'Créer une sauvegarde',                    NULL, 152),
  ('sauvegardes.restaurer',    'Paramètres', 'Restaurer une sauvegarde',                'Écrase les données actuelles. Réservée à l''administrateur.', 153);

-- -----------------------------------------------------------------------------
-- Attribution des permissions aux rôles
-- -----------------------------------------------------------------------------

-- Administrateur : tout.
INSERT OR IGNORE INTO role_permissions (role_id, permission_code)
SELECT 1, code FROM permissions;

-- Pharmacien : toutes les fonctions professionnelles.
-- Exclu : gestion des utilisateurs, permissions, restauration de sauvegarde.
INSERT OR IGNORE INTO role_permissions (role_id, permission_code)
SELECT 2, code FROM permissions
WHERE code NOT IN (
  'utilisateurs.gerer', 'utilisateurs.permissions', 'sauvegardes.restaurer',
  'parametres.modifier', 'caisse.corriger'
);

-- Caissier : vendre et tenir la caisse. Consultation du catalogue et du stock,
-- sans possibilité de modifier un prix ni d'ajuster un stock.
INSERT OR IGNORE INTO role_permissions (role_id, permission_code) VALUES
  (3, 'tableau_bord.voir'),
  (3, 'ventes.creer'),
  (3, 'ventes.historique'),
  (3, 'caisse.ouvrir'),
  (3, 'caisse.cloturer'),
  (3, 'caisse.mouvement'),
  (3, 'produits.voir'),
  (3, 'stock.voir'),
  (3, 'clients.voir'),
  (3, 'clients.gerer'),
  (3, 'clients.reglement'),
  (3, 'alertes.voir');

-- Gestionnaire : lecture des données, achats et finances. Aucune opération de caisse.
INSERT OR IGNORE INTO role_permissions (role_id, permission_code) VALUES
  (4, 'tableau_bord.voir'),
  (4, 'ventes.historique'),
  (4, 'caisse.ecarts'),
  (4, 'produits.voir'),
  (4, 'produits.creer'),
  (4, 'produits.modifier'),
  (4, 'stock.voir'),
  (4, 'achats.voir'),
  (4, 'achats.creer'),
  (4, 'achats.payer'),
  (4, 'fournisseurs.voir'),
  (4, 'fournisseurs.gerer'),
  (4, 'clients.voir'),
  (4, 'inventaire.voir'),
  (4, 'finances.voir'),
  (4, 'depenses.voir'),
  (4, 'depenses.creer'),
  (4, 'rapports.voir'),
  (4, 'rapports.exporter'),
  (4, 'alertes.voir'),
  (4, 'alertes.traiter'),
  (4, 'journal.voir'),
  (4, 'parametres.voir');

-- -----------------------------------------------------------------------------
-- Formes pharmaceutiques
-- -----------------------------------------------------------------------------
INSERT OR IGNORE INTO formes (id, nom, abbreviation, ordre) VALUES
  (1,  'Comprimé',            'cp',     10),
  (2,  'Gélule',              'gél',    20),
  (3,  'Sirop',               'sir',    30),
  (4,  'Suspension buvable',  'susp',   40),
  (5,  'Solution injectable', 'inj',    50),
  (6,  'Suppositoire',        'supp',   60),
  (7,  'Pommade',             'pom',    70),
  (8,  'Crème',               'crm',    80),
  (9,  'Gel',                 'gel',    90),
  (10, 'Collyre',             'coll',  100),
  (11, 'Gouttes',             'gtt',   110),
  (12, 'Poudre',              'pdr',   120),
  (13, 'Sachet',              'sach',  130),
  (14, 'Spray',               'spr',   140),
  (15, 'Patch',               'ptch',  150),
  (16, 'Ovule',               'ov',    160),
  (17, 'Dispositif médical',  'dm',    170),
  (18, 'Autre',               '—',     999);

-- -----------------------------------------------------------------------------
-- Unités de vente
-- -----------------------------------------------------------------------------
INSERT OR IGNORE INTO unites (id, nom, abbreviation, ordre) VALUES
  (1, 'Unité',    'u',      10),
  (2, 'Boîte',    'bte',    20),
  (3, 'Plaquette','plq',    30),
  (4, 'Flacon',   'fl',     40),
  (5, 'Tube',     'tube',   50),
  (6, 'Ampoule',  'amp',    60),
  (7, 'Sachet',   'sach',   70),
  (8, 'Paquet',   'pqt',    80);

-- -----------------------------------------------------------------------------
-- Catégories de produits
-- -----------------------------------------------------------------------------
INSERT OR IGNORE INTO categories (id, nom, ordre) VALUES
  (1, 'Médicament',        10),
  (2, 'Parapharmacie',     20),
  (3, 'Hygiène et soins',  30),
  (4, 'Matériel médical',  40),
  (5, 'Nutrition',         50),
  (6, 'Divers',            60);

-- -----------------------------------------------------------------------------
-- Catégories de dépenses
-- -----------------------------------------------------------------------------
INSERT OR IGNORE INTO depense_categories (id, nom, ordre) VALUES
  (1, 'Salaires',       10),
  (2, 'Loyer',          20),
  (3, 'Électricité',    30),
  (4, 'Eau',            40),
  (5, 'Transport',      50),
  (6, 'Maintenance',    60),
  (7, 'Fournitures',    70),
  (8, 'Taxes et impôts',80),
  (9, 'Autre',          90);

-- -----------------------------------------------------------------------------
-- Paramètres par défaut
-- -----------------------------------------------------------------------------
INSERT OR IGNORE INTO parametres (cle, valeur, type, categorie, libelle, description) VALUES
  ('peremption.seuil_alerte_jours', '90',  'entier',  'stock',
   'Seuil d''alerte de péremption', 'Nombre de jours avant expiration à partir duquel un lot est signalé.'),
  ('peremption.bloquer_vente_expire', '1', 'booleen', 'stock',
   'Interdire la vente d''un produit expiré', 'Empêche la sortie d''un lot dont la date de péremption est dépassée.'),
  ('peremption.avertir_vente_proche', '1', 'booleen', 'stock',
   'Avertir lors de la vente d''un lot proche de péremption', NULL),
  ('stock.avertir_quantite_inhabituelle', '1', 'booleen', 'stock',
   'Signaler une quantité inhabituelle', 'Demande confirmation lorsqu''une quantité s''écarte fortement des habitudes.'),
  ('ventes.remise_max_pourcent', '10', 'entier', 'ventes',
   'Remise maximale autorisée', 'En pourcentage. Au-delà, une autorisation est requise.'),
  ('ventes.imprimer_ticket', '1', 'booleen', 'ventes',
   'Proposer l''impression du ticket après la vente', NULL),
  ('caisse.exiger_ouverture', '1', 'booleen', 'caisse',
   'Exiger une caisse ouverte pour vendre', 'Garantit que chaque vente est rattachée à une session de caisse.'),
  ('caisse.ecart_tolere', '0', 'entier', 'caisse',
   'Écart de caisse toléré sans justification', 'Au-delà, une justification est obligatoire à la clôture.'),
  ('securite.duree_session_minutes', '480', 'entier', 'securite',
   'Durée d''une session', 'Déconnexion automatique après cette durée d''inactivité.'),
  ('securite.tentatives_max', '5', 'entier', 'securite',
   'Tentatives de connexion avant verrouillage', NULL),
  ('securite.verrouillage_minutes', '15', 'entier', 'securite',
   'Durée du verrouillage du compte', NULL),
  ('sauvegarde.automatique', '1', 'booleen', 'securite',
   'Sauvegardes automatiques', 'Une sauvegarde est créée à la fermeture du logiciel.'),
  ('sauvegarde.conserver_nombre', '30', 'entier', 'securite',
   'Nombre de sauvegardes conservées', 'Les plus anciennes sont supprimées au-delà de ce nombre.');
