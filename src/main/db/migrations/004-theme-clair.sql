-- =============================================================================
-- Migration 4 — le theme clair devient le defaut
--
-- La cle « sauge » designait un theme a barre laterale sombre. Le defaut est
-- desormais « clair », a barre laterale blanche. Les bases installees avant
-- ce changement sont mises a jour ; celles qui ont choisi un autre theme
-- gardent le leur.
-- =============================================================================

UPDATE parametres SET valeur = 'clair' WHERE cle = 'interface.theme' AND valeur = 'sauge';

UPDATE parametres
   SET description = 'Valeur de depart des postes. Chaque poste peut ensuite choisir le sien : clair, ocean, cobalt, ardoise ou brique.'
 WHERE cle = 'interface.theme';
