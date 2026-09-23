-- Le code de secours : rouvrir un compte dont le mot de passe est perdu.
--
-- Jusqu'ici, un administrateur pouvait reinitialiser le mot de passe de
-- n'importe qui depuis l'ecran Utilisateurs. Mais si c'est LE SEUL
-- administrateur qui oublie le sien, plus personne n'entre : la base est
-- chiffree, et l'editeur lui-meme ne peut rien faire. L'officine est enfermee
-- dehors avec ses donnees dedans.
--
-- Chaque compte recoit donc un code imprime, a ranger au coffre. Il rouvre le
-- compte une fois, puis est remplace par un neuf.
--
-- Le code n'est PAS conserve en clair : seule son empreinte l'est, calculee
-- comme celle d'un mot de passe. Quelqu'un qui ouvrirait la base n'y lirait
-- pas de quoi entrer ; et nous ne pouvons pas le retrouver pour le client.
-- C'est le prix d'un code qui protege vraiment.

ALTER TABLE utilisateurs ADD COLUMN code_secours_hash TEXT;
ALTER TABLE utilisateurs ADD COLUMN code_secours_sel TEXT;
ALTER TABLE utilisateurs ADD COLUMN code_secours_iter INTEGER;
ALTER TABLE utilisateurs ADD COLUMN code_secours_cree_at TEXT;
ALTER TABLE utilisateurs ADD COLUMN code_secours_utilise_at TEXT;

-- Les essais rates sur le code de secours se comptent a part des essais de
-- connexion : sans cela, quelqu'un qui cherche le code au hasard bloquerait le
-- compte et le pharmacien croirait a une panne.
ALTER TABLE utilisateurs ADD COLUMN secours_tentatives INTEGER NOT NULL DEFAULT 0;
ALTER TABLE utilisateurs ADD COLUMN secours_bloque_jusqu_a TEXT;
