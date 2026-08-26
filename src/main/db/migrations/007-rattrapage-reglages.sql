-- =============================================================================
-- Migration 7 — Rattrapage des réglages
--
-- DÉFAUT CORRIGÉ ICI, ET LEÇON RETENUE.
--
-- Une migration déjà appliquée chez un client ne doit JAMAIS être modifiée :
-- sa version est marquée « appliquée », et le fichier ne sera plus jamais
-- rejoué. Toute ligne ajoutée après coup à `seed.sql` ou à une migration
-- publiée n'atteint donc que les bases neuves.
--
-- C'est ce qui s'est produit pour « interface.theme » : la clé a été ajoutée à
-- la migration 3 après que des officines l'avaient déjà passée. Résultat, le
-- réglage du thème existait sur une installation neuve et manquait sur une
-- installation mise à jour — sans erreur, sans message, avec un simple écran
-- de paramètres incomplet.
--
-- Cette migration réaffirme donc l'ENSEMBLE des réglages attendus, en
-- `INSERT OR IGNORE` : elle ne touche aucune valeur déjà choisie par
-- l'officine, et fait converger toutes les bases quel que soit leur passé.
--
-- Règle pour la suite : un nouveau réglage se déclare dans une NOUVELLE
-- migration, jamais dans un fichier déjà publié.
-- =============================================================================

INSERT OR IGNORE INTO parametres (cle, valeur, type, categorie, libelle, description) VALUES
  ('caisse.ecart_tolere', '0', 'entier', 'caisse',
   'Écart de caisse toléré sans justification', 'Au-delà, une justification est obligatoire à la clôture.'),
  ('caisse.exiger_ouverture', '1', 'booleen', 'caisse',
   'Exiger une caisse ouverte pour vendre', 'Garantit que chaque vente est rattachée à une session de caisse.'),
  ('interface.theme', 'clair', 'texte', 'general',
   'Thème par défaut du logiciel', 'Valeur de depart des postes. Chaque poste peut ensuite choisir le sien : clair, ocean, cobalt, ardoise ou brique.'),
  ('impression.copies_facture', '1', 'entier', 'impression',
   'Nombre d''exemplaires par facture', 'Utile lorsque le client et la pharmacie conservent chacun un exemplaire.'),
  ('impression.format_defaut', 'ticket', 'texte', 'impression',
   'Format d''impression par défaut', 'ticket (80 mm), ticket57 (57 mm), a5 ou a4. Le format reste modifiable au moment d''imprimer.'),
  ('impression.imprimante_a4', '', 'texte', 'impression',
   'Imprimante des factures A4', 'Vide : l''imprimante par défaut de Windows.'),
  ('impression.imprimante_a5', '', 'texte', 'impression',
   'Imprimante des factures A5', 'Vide : l''imprimante par défaut de Windows.'),
  ('impression.imprimante_ticket', '', 'texte', 'impression',
   'Imprimante des tickets', 'Imprimante thermique du comptoir. Vide : l''imprimante par défaut de Windows.'),
  ('impression.pied_ticket', 'Merci de votre visite', 'texte', 'impression',
   'Message de bas de ticket', 'Apparaît en bas de chaque ticket de caisse.'),
  ('impression.silencieuse', '1', 'booleen', 'impression',
   'Imprimer sans boîte de dialogue', 'Le document part directement sur l''imprimante choisie pour son format. Décochez pour retrouver la fenêtre d''impression de Windows.'),
  ('impression.ticket_automatique', '0', 'booleen', 'impression',
   'Imprimer le ticket automatiquement après la vente', 'Sans confirmation. À n''activer que si une imprimante thermique est toujours disponible.'),
  ('produits.marge_par_defaut', '30', 'entier', 'produits',
   'Marge par défaut proposée', 'Marge visée sur le prix de vente, utilisée pour proposer un prix lors de la création d''un produit. Zéro désactive la proposition.'),
  ('sauvegarde.alerte_jours', '3', 'entier', 'securite',
   'Alerter si aucune copie externe depuis (jours)', 'Au-delà de ce délai sans copie hors de la machine, une alerte est levée sur le tableau de bord. Zéro désactive l''alerte.'),
  ('sauvegarde.automatique', '1', 'booleen', 'securite',
   'Sauvegardes automatiques', 'Une sauvegarde est créée à la fermeture du logiciel.'),
  ('sauvegarde.conserver_nombre', '30', 'entier', 'securite',
   'Nombre de sauvegardes conservées', 'Les plus anciennes sont supprimées au-delà de ce nombre.'),
  ('sauvegarde.destination_externe', '', 'texte', 'securite',
   'Copie de sauvegarde hors de la machine', 'Dossier où chaque sauvegarde est recopiée : clé USB, disque externe ou dossier réseau. Sans cette copie, une sauvegarde ne protège que des fausses manœuvres, pas d''un vol ni d''un incendie.'),
  ('securite.duree_session_minutes', '480', 'entier', 'securite',
   'Durée d''une session', 'Déconnexion automatique après cette durée d''inactivité.'),
  ('securite.tentatives_max', '5', 'entier', 'securite',
   'Tentatives de connexion avant verrouillage', NULL),
  ('securite.verrouillage_minutes', '15', 'entier', 'securite',
   'Durée du verrouillage du compte', NULL),
  ('securite.verrouillage_poste_minutes', '10', 'entier', 'securite',
   'Verrouiller le poste après (minutes d''inactivité)', 'Le mot de passe est redemandé pour reprendre la main. La session reste ouverte : rien n''est perdu. Zéro désactive le verrouillage.'),
  ('peremption.avertir_vente_proche', '1', 'booleen', 'stock',
   'Avertir lors de la vente d''un lot proche de péremption', NULL),
  ('peremption.bloquer_vente_expire', '1', 'booleen', 'stock',
   'Interdire la vente d''un produit expiré', 'Empêche la sortie d''un lot dont la date de péremption est dépassée.'),
  ('peremption.seuil_alerte_jours', '90', 'entier', 'stock',
   'Seuil d''alerte de péremption', 'Nombre de jours avant expiration à partir duquel un lot est signalé.'),
  ('stock.avertir_quantite_inhabituelle', '1', 'booleen', 'stock',
   'Signaler une quantité inhabituelle', 'Demande confirmation lorsqu''une quantité s''écarte fortement des habitudes.'),
  ('comptoir.avertir_scan_inconnu', '1', 'booleen', 'ventes',
   'Signaler un code-barres inconnu', 'Affiche un avertissement lorsque le code lu ne correspond à aucun produit du catalogue.'),
  ('comptoir.scan_ajoute_directement', '1', 'booleen', 'ventes',
   'Ajouter au panier dès la lecture du code-barres', 'Décochez pour que le code lu remplisse seulement la recherche, sans ajouter le produit.'),
  ('ventes.imprimer_ticket', '1', 'booleen', 'ventes',
   'Proposer l''impression du ticket après la vente', NULL),
  ('ventes.remise_max_pourcent', '10', 'entier', 'ventes',
   'Remise maximale autorisée', 'En pourcentage. Au-delà, une autorisation est requise.');
