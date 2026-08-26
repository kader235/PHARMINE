-- =============================================================================
-- Migration 8 — Sauvegardes chiffrées
--
-- Une sauvegarde voyage : clé USB, disque externe, dossier réseau. C'est par
-- là que les données d'une officine sortent réellement. Un fichier SQLite se
-- lit avec n'importe quel outil gratuit — prix d'achat, marges, fichier
-- clients, chiffre d'affaires, tout est en clair.
--
-- Les sauvegardes sont donc chiffrées. La clé est tirée au sort au premier
-- besoin et rangée ici même : le logiciel restaure ses propres sauvegardes
-- sans rien demander. Elle est aussi affichable sous forme de clé de secours,
-- à conserver hors de l'ordinateur — sans elle, un disque retrouvé après un
-- sinistre ne servirait à rien.
--
-- La base vivante, elle, reste en clair : le moteur SQLite fourni avec
-- Electron ne sait pas chiffrer. Voir services/coffre.ts.
-- =============================================================================

INSERT OR IGNORE INTO parametres (cle, valeur, type, categorie, libelle, description) VALUES
  ('sauvegarde.chiffrement', '1', 'booleen', 'securite',
   'Chiffrer les sauvegardes',
   'Une sauvegarde chiffrée est illisible hors du logiciel, y compris si la clé USB est perdue ou volée. Notez votre clé de secours avant de désactiver ce réglage.'),

  ('securite.cle_sauvegarde', '', 'texte', 'securite',
   'Clé de chiffrement des sauvegardes',
   'Créée automatiquement à la première sauvegarde. Ne se modifie pas à la main : notez la clé de secours affichée dans l''onglet Sauvegardes.');
