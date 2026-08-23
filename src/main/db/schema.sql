-- =============================================================================
-- PHARMINA — Schéma de la base de données
-- SQLite 3.53 (node:sqlite)
--
-- CONVENTIONS
--   Montants  : INTEGER, exprimés dans la plus petite unité de la devise.
--               Jamais de flottant sur une valeur monétaire.
--   Dates     : TEXT ISO-8601. Horodatage complet en UTC ('...Z'),
--               dates civiles au format 'YYYY-MM-DD'.
--   Suppression : aucune ligne métier n'est supprimée. On renseigne
--               `archived_at` (protection contre les suppressions accidentelles).
--   Stock     : la quantité disponible n'est JAMAIS stockée sur le produit.
--               Elle est toujours la somme des lots. Un produit non suivi par
--               lot reçoit un lot implicite. Une seule règle, donc un seul
--               comportement possible pour le FEFO et la traçabilité.
-- =============================================================================

PRAGMA foreign_keys = ON;

-- =============================================================================
-- 1. SYSTÈME
-- =============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  nom         TEXT    NOT NULL,
  applied_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Fiche de l'officine. Une seule ligne, contrainte par id = 1.
CREATE TABLE IF NOT EXISTS pharmacie (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  nom                TEXT    NOT NULL,
  raison_sociale     TEXT,
  adresse            TEXT,
  ville              TEXT,
  pays               TEXT,
  telephone          TEXT,
  email              TEXT,
  registre_commerce  TEXT,
  numero_ordre       TEXT,
  devise             TEXT    NOT NULL DEFAULT 'XOF',
  devise_symbole     TEXT    NOT NULL DEFAULT 'FCFA',
  devise_decimales   INTEGER NOT NULL DEFAULT 0 CHECK (devise_decimales BETWEEN 0 AND 3),
  fuseau_horaire     TEXT    NOT NULL DEFAULT 'Africa/Abidjan',
  logo               BLOB,
  configure_at       TEXT,
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT
);

-- Préférences clé/valeur. `categorie` sert au regroupement dans l'écran Paramètres.
CREATE TABLE IF NOT EXISTS parametres (
  cle          TEXT PRIMARY KEY,
  valeur       TEXT,
  type         TEXT NOT NULL DEFAULT 'texte'
               CHECK (type IN ('texte','entier','booleen','json','date')),
  categorie    TEXT NOT NULL DEFAULT 'general',
  libelle      TEXT NOT NULL,
  description  TEXT,
  updated_at   TEXT,
  updated_by   INTEGER REFERENCES utilisateurs(id)
);

-- =============================================================================
-- 2. SÉCURITÉ : rôles, permissions, utilisateurs, sessions, journal
-- =============================================================================

CREATE TABLE IF NOT EXISTS roles (
  id          INTEGER PRIMARY KEY,
  code        TEXT    NOT NULL UNIQUE,
  nom         TEXT    NOT NULL,
  description TEXT,
  systeme     INTEGER NOT NULL DEFAULT 0 CHECK (systeme IN (0,1)),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS permissions (
  code        TEXT PRIMARY KEY,
  module      TEXT NOT NULL,
  libelle     TEXT NOT NULL,
  description TEXT,
  ordre       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id         INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_code TEXT    NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE IF NOT EXISTS utilisateurs (
  id                    INTEGER PRIMARY KEY,
  code                  TEXT    NOT NULL UNIQUE,
  identifiant           TEXT    NOT NULL UNIQUE,
  nom_complet           TEXT    NOT NULL,
  mot_de_passe_hash     TEXT    NOT NULL,
  mot_de_passe_sel      TEXT    NOT NULL,
  mot_de_passe_iter     INTEGER NOT NULL,
  role_id               INTEGER NOT NULL REFERENCES roles(id),
  telephone             TEXT,
  email                 TEXT,
  actif                 INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0,1)),
  doit_changer_mdp      INTEGER NOT NULL DEFAULT 0 CHECK (doit_changer_mdp IN (0,1)),
  tentatives_echouees   INTEGER NOT NULL DEFAULT 0,
  verrouille_jusqu_a    TEXT,
  derniere_connexion_at TEXT,
  created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by            INTEGER REFERENCES utilisateurs(id),
  archived_at           TEXT
);
CREATE INDEX IF NOT EXISTS idx_utilisateurs_actif ON utilisateurs(actif, archived_at);

-- Dérogations individuelles : accorde (1) ou retire (0) une permission
-- indépendamment du rôle. Permet la « personnalisation des permissions ».
CREATE TABLE IF NOT EXISTS utilisateur_permissions (
  utilisateur_id  INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  permission_code TEXT    NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  accordee        INTEGER NOT NULL CHECK (accordee IN (0,1)),
  PRIMARY KEY (utilisateur_id, permission_code)
);

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  utilisateur_id  INTEGER NOT NULL REFERENCES utilisateurs(id),
  ouverte_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  derniere_activite_at TEXT,
  fermee_at       TEXT,
  motif_fermeture TEXT CHECK (motif_fermeture IN ('deconnexion','expiration','arret','forcee'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_ouvertes ON sessions(fermee_at, utilisateur_id);

-- Journal d'activité : trace des opérations importantes. En ajout seul.
CREATE TABLE IF NOT EXISTS journal_activite (
  id             INTEGER PRIMARY KEY,
  at             TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  utilisateur_id INTEGER REFERENCES utilisateurs(id),
  action         TEXT    NOT NULL,
  entite         TEXT    NOT NULL,
  entite_id      INTEGER,
  resume         TEXT    NOT NULL,
  details        TEXT,
  resultat       TEXT    NOT NULL DEFAULT 'succes'
                 CHECK (resultat IN ('succes','echec','refuse'))
);
CREATE INDEX IF NOT EXISTS idx_journal_at ON journal_activite(at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entite ON journal_activite(entite, entite_id);
CREATE INDEX IF NOT EXISTS idx_journal_user ON journal_activite(utilisateur_id, at DESC);

-- =============================================================================
-- 3. CATALOGUE
-- =============================================================================

CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY,
  nom         TEXT    NOT NULL UNIQUE,
  parent_id   INTEGER REFERENCES categories(id),
  ordre       INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS laboratoires (
  id          INTEGER PRIMARY KEY,
  nom         TEXT    NOT NULL UNIQUE,
  pays        TEXT,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS formes (
  id          INTEGER PRIMARY KEY,
  nom         TEXT    NOT NULL UNIQUE,
  abbreviation TEXT,
  ordre       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS unites (
  id           INTEGER PRIMARY KEY,
  nom          TEXT    NOT NULL UNIQUE,
  abbreviation TEXT    NOT NULL,
  ordre        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS produits (
  id                 INTEGER PRIMARY KEY,
  code_interne       TEXT    NOT NULL UNIQUE,
  nom_commercial     TEXT    NOT NULL,
  nom_generique      TEXT,
  principe_actif     TEXT,
  dosage             TEXT,
  categorie_id       INTEGER REFERENCES categories(id),
  laboratoire_id     INTEGER REFERENCES laboratoires(id),
  forme_id           INTEGER REFERENCES formes(id),
  unite_id           INTEGER REFERENCES unites(id),
  prix_achat         INTEGER NOT NULL DEFAULT 0 CHECK (prix_achat >= 0),
  prix_vente         INTEGER NOT NULL DEFAULT 0 CHECK (prix_vente >= 0),
  taux_tva           INTEGER NOT NULL DEFAULT 0,   -- en centièmes de %  (1800 = 18,00 %)
  stock_min          INTEGER NOT NULL DEFAULT 0 CHECK (stock_min >= 0),
  stock_max          INTEGER,
  emplacement        TEXT,
  ordonnance_requise INTEGER NOT NULL DEFAULT 0 CHECK (ordonnance_requise IN (0,1)),
  suivi_peremption   INTEGER NOT NULL DEFAULT 1 CHECK (suivi_peremption IN (0,1)),
  vente_autorisee    INTEGER NOT NULL DEFAULT 1 CHECK (vente_autorisee IN (0,1)),
  notes              TEXT,
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by         INTEGER REFERENCES utilisateurs(id),
  updated_at         TEXT,
  updated_by         INTEGER REFERENCES utilisateurs(id),
  archived_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_produits_nom ON produits(nom_commercial);
CREATE INDEX IF NOT EXISTS idx_produits_categorie ON produits(categorie_id);
CREATE INDEX IF NOT EXISTS idx_produits_actifs ON produits(archived_at, vente_autorisee);

-- Un produit peut porter plusieurs codes-barres (conditionnements différents).
CREATE TABLE IF NOT EXISTS produit_codes_barres (
  code       TEXT PRIMARY KEY,
  produit_id INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  principal  INTEGER NOT NULL DEFAULT 0 CHECK (principal IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_codes_barres_produit ON produit_codes_barres(produit_id);

-- Recherche plein texte : nom commercial, générique, principe actif, code.
-- Alimentée par déclencheurs pour ne jamais désynchroniser.
CREATE VIRTUAL TABLE IF NOT EXISTS produits_fts USING fts5(
  nom_commercial,
  nom_generique,
  principe_actif,
  code_interne,
  content = 'produits',
  content_rowid = 'id',
  tokenize = "unicode61 remove_diacritics 2"
);

CREATE TRIGGER IF NOT EXISTS produits_fts_ai AFTER INSERT ON produits BEGIN
  INSERT INTO produits_fts(rowid, nom_commercial, nom_generique, principe_actif, code_interne)
  VALUES (new.id, new.nom_commercial, new.nom_generique, new.principe_actif, new.code_interne);
END;
CREATE TRIGGER IF NOT EXISTS produits_fts_ad AFTER DELETE ON produits BEGIN
  INSERT INTO produits_fts(produits_fts, rowid, nom_commercial, nom_generique, principe_actif, code_interne)
  VALUES ('delete', old.id, old.nom_commercial, old.nom_generique, old.principe_actif, old.code_interne);
END;
CREATE TRIGGER IF NOT EXISTS produits_fts_au AFTER UPDATE ON produits BEGIN
  INSERT INTO produits_fts(produits_fts, rowid, nom_commercial, nom_generique, principe_actif, code_interne)
  VALUES ('delete', old.id, old.nom_commercial, old.nom_generique, old.principe_actif, old.code_interne);
  INSERT INTO produits_fts(rowid, nom_commercial, nom_generique, principe_actif, code_interne)
  VALUES (new.id, new.nom_commercial, new.nom_generique, new.principe_actif, new.code_interne);
END;

-- =============================================================================
-- 4. PARTENAIRES
-- =============================================================================

CREATE TABLE IF NOT EXISTS fournisseurs (
  id                   INTEGER PRIMARY KEY,
  code                 TEXT    NOT NULL UNIQUE,
  nom                  TEXT    NOT NULL,
  contact_principal    TEXT,
  telephone            TEXT,
  email                TEXT,
  adresse              TEXT,
  ville                TEXT,
  pays                 TEXT,
  conditions_paiement  TEXT,
  delai_livraison_jours INTEGER,
  notes                TEXT,
  created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by           INTEGER REFERENCES utilisateurs(id),
  archived_at          TEXT
);
CREATE INDEX IF NOT EXISTS idx_fournisseurs_nom ON fournisseurs(nom);

CREATE TABLE IF NOT EXISTS clients (
  id              INTEGER PRIMARY KEY,
  code            TEXT    NOT NULL UNIQUE,
  nom             TEXT    NOT NULL,
  telephone       TEXT,
  email           TEXT,
  adresse         TEXT,
  date_naissance  TEXT,
  plafond_credit  INTEGER NOT NULL DEFAULT 0 CHECK (plafond_credit >= 0),
  notes           TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by      INTEGER REFERENCES utilisateurs(id),
  archived_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_clients_nom ON clients(nom);
CREATE INDEX IF NOT EXISTS idx_clients_telephone ON clients(telephone);

-- =============================================================================
-- 5. ACHATS ET RÉCEPTIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS achats (
  id              INTEGER PRIMARY KEY,
  reference       TEXT    NOT NULL UNIQUE,
  fournisseur_id  INTEGER NOT NULL REFERENCES fournisseurs(id),
  statut          TEXT    NOT NULL DEFAULT 'brouillon'
                  CHECK (statut IN ('brouillon','commande','recu_partiel','recu','annule')),
  date_commande   TEXT,
  date_reception  TEXT,
  sous_total      INTEGER NOT NULL DEFAULT 0,
  remise          INTEGER NOT NULL DEFAULT 0,
  taxe            INTEGER NOT NULL DEFAULT 0,
  frais           INTEGER NOT NULL DEFAULT 0,
  total           INTEGER NOT NULL DEFAULT 0,
  montant_paye    INTEGER NOT NULL DEFAULT 0,
  note            TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by      INTEGER REFERENCES utilisateurs(id),
  validated_at    TEXT,
  validated_by    INTEGER REFERENCES utilisateurs(id)
);
CREATE INDEX IF NOT EXISTS idx_achats_fournisseur ON achats(fournisseur_id, date_reception DESC);
CREATE INDEX IF NOT EXISTS idx_achats_statut ON achats(statut);

CREATE TABLE IF NOT EXISTS achat_lignes (
  id               INTEGER PRIMARY KEY,
  achat_id         INTEGER NOT NULL REFERENCES achats(id) ON DELETE CASCADE,
  produit_id       INTEGER NOT NULL REFERENCES produits(id),
  quantite         INTEGER NOT NULL CHECK (quantite > 0),
  quantite_recue   INTEGER NOT NULL DEFAULT 0 CHECK (quantite_recue >= 0),
  prix_achat       INTEGER NOT NULL CHECK (prix_achat >= 0),
  numero_lot       TEXT,
  date_peremption  TEXT,
  montant          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_achat_lignes_achat ON achat_lignes(achat_id);

CREATE TABLE IF NOT EXISTS achat_paiements (
  id         INTEGER PRIMARY KEY,
  achat_id   INTEGER NOT NULL REFERENCES achats(id) ON DELETE CASCADE,
  at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  montant    INTEGER NOT NULL CHECK (montant > 0),
  mode       TEXT    NOT NULL CHECK (mode IN ('especes','mobile_money','carte','virement','cheque')),
  reference  TEXT,
  created_by INTEGER REFERENCES utilisateurs(id)
);
CREATE INDEX IF NOT EXISTS idx_achat_paiements_achat ON achat_paiements(achat_id);

-- =============================================================================
-- 6. LOTS ET MOUVEMENTS DE STOCK
-- =============================================================================

CREATE TABLE IF NOT EXISTS lots (
  id                INTEGER PRIMARY KEY,
  produit_id        INTEGER NOT NULL REFERENCES produits(id),
  numero            TEXT,                      -- NULL = lot implicite (produit sans suivi)
  fournisseur_id    INTEGER REFERENCES fournisseurs(id),
  achat_id          INTEGER REFERENCES achats(id),
  date_reception    TEXT    NOT NULL,
  date_peremption   TEXT,                      -- NULL = ne périme pas (matériel)
  quantite_initiale INTEGER NOT NULL CHECK (quantite_initiale >= 0),
  quantite_restante INTEGER NOT NULL CHECK (quantite_restante >= 0),
  prix_achat        INTEGER NOT NULL DEFAULT 0 CHECK (prix_achat >= 0),
  bloque            INTEGER NOT NULL DEFAULT 0 CHECK (bloque IN (0,1)),
  motif_blocage     TEXT,
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (quantite_restante <= quantite_initiale)
);
-- Index FEFO : sortir en priorité le lot qui expire le plus tôt.
CREATE INDEX IF NOT EXISTS idx_lots_fefo
  ON lots(produit_id, bloque, date_peremption, id)
  WHERE quantite_restante > 0;
CREATE INDEX IF NOT EXISTS idx_lots_peremption ON lots(date_peremption) WHERE quantite_restante > 0;
CREATE INDEX IF NOT EXISTS idx_lots_produit ON lots(produit_id);

-- Tout changement de stock passe ici. En ajout seul : c'est le grand livre du stock.
CREATE TABLE IF NOT EXISTS mouvements_stock (
  id              INTEGER PRIMARY KEY,
  at              TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  produit_id      INTEGER NOT NULL REFERENCES produits(id),
  lot_id          INTEGER REFERENCES lots(id),
  type            TEXT    NOT NULL CHECK (type IN (
                    'entree','sortie','vente','retour_client','retour_fournisseur',
                    'ajustement','perte','peremption','inventaire','transfert','annulation_vente')),
  quantite        INTEGER NOT NULL,            -- signé : positif = entrée, négatif = sortie
  stock_avant     INTEGER NOT NULL,
  stock_apres     INTEGER NOT NULL,
  cout_unitaire   INTEGER NOT NULL DEFAULT 0,
  motif           TEXT,
  reference_type  TEXT CHECK (reference_type IN ('vente','achat','inventaire','ajustement','manuel')),
  reference_id    INTEGER,
  utilisateur_id  INTEGER REFERENCES utilisateurs(id)
);
CREATE INDEX IF NOT EXISTS idx_mouvements_produit ON mouvements_stock(produit_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_mouvements_at ON mouvements_stock(at DESC);
CREATE INDEX IF NOT EXISTS idx_mouvements_reference ON mouvements_stock(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_mouvements_lot ON mouvements_stock(lot_id);

-- =============================================================================
-- 7. CAISSE
-- =============================================================================

CREATE TABLE IF NOT EXISTS caisse_sessions (
  id               INTEGER PRIMARY KEY,
  reference        TEXT    NOT NULL UNIQUE,
  utilisateur_id   INTEGER NOT NULL REFERENCES utilisateurs(id),
  ouverte_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  fond_initial     INTEGER NOT NULL DEFAULT 0 CHECK (fond_initial >= 0),
  fermee_at        TEXT,
  fermee_par       INTEGER REFERENCES utilisateurs(id),
  total_theorique  INTEGER,
  total_compte     INTEGER,
  ecart            INTEGER,
  justification    TEXT,
  statut           TEXT    NOT NULL DEFAULT 'ouverte'
                   CHECK (statut IN ('ouverte','fermee'))
);
-- Une seule caisse ouverte à la fois.
CREATE UNIQUE INDEX IF NOT EXISTS idx_caisse_une_seule_ouverte
  ON caisse_sessions((1)) WHERE statut = 'ouverte';

CREATE TABLE IF NOT EXISTS caisse_mouvements (
  id             INTEGER PRIMARY KEY,
  session_id     INTEGER NOT NULL REFERENCES caisse_sessions(id),
  at             TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  type           TEXT    NOT NULL CHECK (type IN (
                   'fond_initial','vente','remboursement','entree','sortie','depense','correction')),
  montant        INTEGER NOT NULL,             -- signé
  mode           TEXT    NOT NULL DEFAULT 'especes'
                 CHECK (mode IN ('especes','mobile_money','carte','virement','cheque','credit')),
  motif          TEXT,
  reference_type TEXT CHECK (reference_type IN ('vente','depense','manuel')),
  reference_id   INTEGER,
  utilisateur_id INTEGER REFERENCES utilisateurs(id)
);
CREATE INDEX IF NOT EXISTS idx_caisse_mouvements_session ON caisse_mouvements(session_id, at);

-- =============================================================================
-- 8. VENTES
-- =============================================================================

CREATE TABLE IF NOT EXISTS ventes (
  id                 INTEGER PRIMARY KEY,
  reference          TEXT    NOT NULL UNIQUE,
  caisse_session_id  INTEGER REFERENCES caisse_sessions(id),
  client_id          INTEGER REFERENCES clients(id),   -- NULL = vente au comptoir
  utilisateur_id     INTEGER NOT NULL REFERENCES utilisateurs(id),
  at                 TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  statut             TEXT    NOT NULL DEFAULT 'finalisee'
                     CHECK (statut IN ('finalisee','annulee','remboursee')),
  sous_total         INTEGER NOT NULL DEFAULT 0,
  remise             INTEGER NOT NULL DEFAULT 0 CHECK (remise >= 0),
  taxe               INTEGER NOT NULL DEFAULT 0,
  total              INTEGER NOT NULL DEFAULT 0,
  cout_total         INTEGER NOT NULL DEFAULT 0,       -- coût d'achat des lots sortis
  montant_recu       INTEGER NOT NULL DEFAULT 0,
  monnaie_rendue     INTEGER NOT NULL DEFAULT 0,
  reste_a_payer      INTEGER NOT NULL DEFAULT 0,       -- > 0 = vente à crédit
  note               TEXT,
  annulee_at         TEXT,
  annulee_par        INTEGER REFERENCES utilisateurs(id),
  motif_annulation   TEXT
);
CREATE INDEX IF NOT EXISTS idx_ventes_at ON ventes(at DESC);
CREATE INDEX IF NOT EXISTS idx_ventes_client ON ventes(client_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_ventes_utilisateur ON ventes(utilisateur_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_ventes_session ON ventes(caisse_session_id);
CREATE INDEX IF NOT EXISTS idx_ventes_credit ON ventes(client_id) WHERE reste_a_payer > 0;

-- Une ligne par lot servi : une même référence peut être servie depuis
-- plusieurs lots (FEFO). C'est ce qui rend la traçabilité réelle.
CREATE TABLE IF NOT EXISTS vente_lignes (
  id             INTEGER PRIMARY KEY,
  vente_id       INTEGER NOT NULL REFERENCES ventes(id) ON DELETE CASCADE,
  produit_id     INTEGER NOT NULL REFERENCES produits(id),
  lot_id         INTEGER REFERENCES lots(id),
  designation    TEXT    NOT NULL,             -- figée au moment de la vente
  quantite       INTEGER NOT NULL CHECK (quantite > 0),
  prix_unitaire  INTEGER NOT NULL CHECK (prix_unitaire >= 0),
  remise         INTEGER NOT NULL DEFAULT 0 CHECK (remise >= 0),
  taux_tva       INTEGER NOT NULL DEFAULT 0,
  montant        INTEGER NOT NULL,
  cout_unitaire  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_vente_lignes_vente ON vente_lignes(vente_id);
CREATE INDEX IF NOT EXISTS idx_vente_lignes_produit ON vente_lignes(produit_id);

-- Plusieurs lignes pour une même vente = paiement mixte.
CREATE TABLE IF NOT EXISTS vente_paiements (
  id        INTEGER PRIMARY KEY,
  vente_id  INTEGER NOT NULL REFERENCES ventes(id) ON DELETE CASCADE,
  mode      TEXT    NOT NULL CHECK (mode IN ('especes','mobile_money','carte','virement','cheque','credit')),
  montant   INTEGER NOT NULL CHECK (montant > 0),
  reference TEXT,
  at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_vente_paiements_vente ON vente_paiements(vente_id);

-- Règlement ultérieur d'une créance client.
CREATE TABLE IF NOT EXISTS client_reglements (
  id         INTEGER PRIMARY KEY,
  client_id  INTEGER NOT NULL REFERENCES clients(id),
  vente_id   INTEGER REFERENCES ventes(id),
  at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  montant    INTEGER NOT NULL CHECK (montant > 0),
  mode       TEXT    NOT NULL CHECK (mode IN ('especes','mobile_money','carte','virement','cheque')),
  reference  TEXT,
  created_by INTEGER REFERENCES utilisateurs(id)
);
CREATE INDEX IF NOT EXISTS idx_client_reglements_client ON client_reglements(client_id, at DESC);

-- =============================================================================
-- 9. INVENTAIRE
-- =============================================================================

CREATE TABLE IF NOT EXISTS inventaires (
  id            INTEGER PRIMARY KEY,
  reference     TEXT    NOT NULL UNIQUE,
  libelle       TEXT    NOT NULL,
  perimetre     TEXT    NOT NULL DEFAULT 'total'
                CHECK (perimetre IN ('total','categorie','emplacement','selection')),
  perimetre_ref TEXT,
  statut        TEXT    NOT NULL DEFAULT 'en_cours'
                CHECK (statut IN ('en_cours','valide','annule')),
  ouvert_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ouvert_par    INTEGER NOT NULL REFERENCES utilisateurs(id),
  valide_at     TEXT,
  valide_par    INTEGER REFERENCES utilisateurs(id),
  ecart_valeur  INTEGER NOT NULL DEFAULT 0,
  note          TEXT
);

CREATE TABLE IF NOT EXISTS inventaire_lignes (
  id               INTEGER PRIMARY KEY,
  inventaire_id    INTEGER NOT NULL REFERENCES inventaires(id) ON DELETE CASCADE,
  produit_id       INTEGER NOT NULL REFERENCES produits(id),
  lot_id           INTEGER REFERENCES lots(id),
  stock_theorique  INTEGER NOT NULL,
  stock_compte     INTEGER,
  ecart            INTEGER,
  justification    TEXT,
  compte_at        TEXT,
  compte_par       INTEGER REFERENCES utilisateurs(id)
);
CREATE INDEX IF NOT EXISTS idx_inventaire_lignes ON inventaire_lignes(inventaire_id);

-- =============================================================================
-- 10. DÉPENSES
-- =============================================================================

CREATE TABLE IF NOT EXISTS depense_categories (
  id     INTEGER PRIMARY KEY,
  nom    TEXT    NOT NULL UNIQUE,
  ordre  INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS depenses (
  id           INTEGER PRIMARY KEY,
  reference    TEXT    NOT NULL UNIQUE,
  date         TEXT    NOT NULL,
  categorie_id INTEGER NOT NULL REFERENCES depense_categories(id),
  libelle      TEXT    NOT NULL,
  montant      INTEGER NOT NULL CHECK (montant > 0),
  mode         TEXT    NOT NULL DEFAULT 'especes'
               CHECK (mode IN ('especes','mobile_money','carte','virement','cheque')),
  beneficiaire TEXT,
  sur_caisse   INTEGER NOT NULL DEFAULT 1 CHECK (sur_caisse IN (0,1)),
  note         TEXT,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by   INTEGER NOT NULL REFERENCES utilisateurs(id),
  archived_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_depenses_date ON depenses(date DESC);
CREATE INDEX IF NOT EXISTS idx_depenses_categorie ON depenses(categorie_id);

-- =============================================================================
-- 11. ALERTES
-- =============================================================================

CREATE TABLE IF NOT EXISTS alertes (
  id          INTEGER PRIMARY KEY,
  cle         TEXT    NOT NULL UNIQUE,   -- déduplication : une alerte par situation
  type        TEXT    NOT NULL CHECK (type IN (
                'rupture','stock_faible','peremption_proche','produit_expire',
                'caisse_non_cloturee','ecart_caisse','dette_fournisseur',
                'creance_client','inventaire_en_cours','sauvegarde')),
  priorite    TEXT    NOT NULL CHECK (priorite IN ('urgent','important','information')),
  titre       TEXT    NOT NULL,
  message     TEXT    NOT NULL,
  entite      TEXT,
  entite_id   INTEGER,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  lue_at      TEXT,
  lue_par     INTEGER REFERENCES utilisateurs(id),
  resolue_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_alertes_actives ON alertes(resolue_at, priorite, created_at DESC);

-- =============================================================================
-- 12. SAUVEGARDES
-- =============================================================================

CREATE TABLE IF NOT EXISTS sauvegardes (
  id          INTEGER PRIMARY KEY,
  fichier     TEXT    NOT NULL,
  taille      INTEGER,
  at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  declencheur TEXT    NOT NULL CHECK (declencheur IN ('automatique','manuelle','avant_migration')),
  statut      TEXT    NOT NULL DEFAULT 'ok' CHECK (statut IN ('ok','echec')),
  message     TEXT,
  created_by  INTEGER REFERENCES utilisateurs(id)
);
CREATE INDEX IF NOT EXISTS idx_sauvegardes_at ON sauvegardes(at DESC);

-- =============================================================================
-- 13. VUES
-- Le stock et les dettes ne sont jamais stockés : ils sont calculés,
-- donc toujours exacts.
-- =============================================================================

CREATE VIEW IF NOT EXISTS v_stock_produit AS
SELECT
  p.id                                        AS produit_id,
  COALESCE(SUM(l.quantite_restante), 0)       AS stock,
  COALESCE(SUM(CASE WHEN l.bloque = 0 THEN l.quantite_restante ELSE 0 END), 0) AS stock_disponible,
  COALESCE(SUM(l.quantite_restante * l.prix_achat), 0) AS valeur_achat,
  MIN(CASE WHEN l.quantite_restante > 0 THEN l.date_peremption END) AS prochaine_peremption,
  COUNT(CASE WHEN l.quantite_restante > 0 THEN 1 END) AS lots_actifs
FROM produits p
LEFT JOIN lots l ON l.produit_id = p.id
GROUP BY p.id;

CREATE VIEW IF NOT EXISTS v_produit_etat AS
SELECT
  p.id, p.code_interne, p.nom_commercial, p.nom_generique, p.dosage,
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

CREATE VIEW IF NOT EXISTS v_peremptions AS
SELECT
  l.id AS lot_id, l.numero, l.date_peremption, l.quantite_restante,
  l.prix_achat, l.quantite_restante * l.prix_achat AS valeur,
  p.id AS produit_id, p.nom_commercial, p.dosage, p.emplacement,
  CAST(julianday(l.date_peremption) - julianday('now') AS INTEGER) AS jours_restants,
  CASE
    WHEN julianday(l.date_peremption) <  julianday('now')      THEN 'expire'
    WHEN julianday(l.date_peremption) <= julianday('now', '+7 day')  THEN 'j7'
    WHEN julianday(l.date_peremption) <= julianday('now', '+30 day') THEN 'j30'
    WHEN julianday(l.date_peremption) <= julianday('now', '+90 day') THEN 'j90'
    ELSE 'ok'
  END AS palier
FROM lots l
JOIN produits p ON p.id = l.produit_id
WHERE l.quantite_restante > 0 AND l.date_peremption IS NOT NULL;

CREATE VIEW IF NOT EXISTS v_dette_fournisseur AS
SELECT
  f.id AS fournisseur_id, f.nom,
  COALESCE(SUM(a.total), 0)        AS total_achats,
  COALESCE(SUM(a.montant_paye), 0) AS total_paye,
  COALESCE(SUM(a.total - a.montant_paye), 0) AS solde_du,
  MAX(a.date_reception)            AS dernier_achat
FROM fournisseurs f
LEFT JOIN achats a ON a.fournisseur_id = f.id AND a.statut IN ('recu','recu_partiel')
GROUP BY f.id;

CREATE VIEW IF NOT EXISTS v_creance_client AS
SELECT
  c.id AS client_id, c.nom, c.telephone, c.plafond_credit,
  COALESCE((SELECT SUM(v.total) FROM ventes v
            WHERE v.client_id = c.id AND v.statut = 'finalisee'), 0) AS total_achats,
  COALESCE((SELECT SUM(v.reste_a_payer) FROM ventes v
            WHERE v.client_id = c.id AND v.statut = 'finalisee'), 0)
  - COALESCE((SELECT SUM(r.montant) FROM client_reglements r
            WHERE r.client_id = c.id), 0) AS solde_du,
  (SELECT MAX(v.at) FROM ventes v WHERE v.client_id = c.id) AS derniere_visite
FROM clients c;
