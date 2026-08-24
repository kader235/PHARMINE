-- =============================================================================
-- Migration 3 — formats d'impression et lecture des codes-barres
--
-- Ajoutée après la première mise en service : les bases déjà installées
-- reçoivent ces réglages sans perdre leurs données. `INSERT OR IGNORE` rend la
-- migration rejouable sans effet de bord.
-- =============================================================================

INSERT OR IGNORE INTO parametres (cle, valeur, type, categorie, libelle, description) VALUES
  ('impression.format_defaut', 'ticket', 'texte', 'impression',
   'Format d''impression par défaut',
   'ticket (80 mm), ticket57 (57 mm), a5 ou a4. Le format reste modifiable au moment d''imprimer.'),

  ('impression.copies_facture', '1', 'entier', 'impression',
   'Nombre d''exemplaires par facture',
   'Utile lorsque le client et la pharmacie conservent chacun un exemplaire.'),

  ('impression.ticket_automatique', '0', 'booleen', 'impression',
   'Imprimer le ticket automatiquement après la vente',
   'Sans confirmation. À n''activer que si une imprimante thermique est toujours disponible.'),

  ('impression.pied_ticket', 'Merci de votre visite', 'texte', 'impression',
   'Message de bas de ticket',
   'Apparaît en bas de chaque ticket de caisse.'),

  ('comptoir.scan_ajoute_directement', '1', 'booleen', 'ventes',
   'Ajouter au panier dès la lecture du code-barres',
   'Décochez pour que le code lu remplisse seulement la recherche, sans ajouter le produit.'),

  ('comptoir.avertir_scan_inconnu', '1', 'booleen', 'ventes',
   'Signaler un code-barres inconnu',
   'Affiche un avertissement lorsque le code lu ne correspond à aucun produit du catalogue.');
