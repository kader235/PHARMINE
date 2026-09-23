/**
 * Le code de secours : rouvrir un compte dont le mot de passe est perdu.
 *
 * LE PROBLÈME QU'IL RÉSOUT
 *
 * Un administrateur pouvait déjà réinitialiser le mot de passe de n'importe
 * qui. Mais si c'est le SEUL administrateur qui oublie le sien, plus personne
 * n'entre. La base est chiffrée par une clé propre au poste ; ni le pharmacien
 * ni nous ne pouvons l'ouvrir autrement. L'officine se retrouve enfermée
 * dehors avec ses données dedans, et la seule issue serait de tout recommencer.
 *
 * COMMENT IL MARCHE
 *
 * À la création du compte, le logiciel tire un code au hasard, l'affiche une
 * fois, et n'en garde que l'empreinte — calculée comme celle d'un mot de passe,
 * deux cent dix mille tours. Le pharmacien l'imprime et le range au coffre.
 *
 * Le jour où le mot de passe est perdu, le code le remplace : le compte
 * rouvre, un mot de passe neuf est choisi, et un code neuf est délivré dans la
 * foulée. Un code ne sert qu'une fois.
 *
 * CE QU'IL NE PEUT PAS FAIRE
 *
 * Nous ne pouvons pas le retrouver à la place du client : nous ne l'avons
 * jamais eu. C'est précisément ce qui fait qu'un employé curieux, ou un voleur
 * d'ordinateur, ne peut pas l'obtenir non plus. Un code perdu ET un mot de
 * passe oublié, c'est la base à reprendre depuis une sauvegarde sur un poste
 * neuf — d'où l'insistance, dans le guide, à le ranger ailleurs que dans le
 * tiroir de la caisse.
 *
 * POURQUOI PAS DE QUESTIONS SECRÈTES
 *
 * « Le nom de votre mère » se devine dans une officine où tout le monde se
 * connaît, et s'écrit de trois façons — avec ou sans accent, en majuscules —
 * si bien qu'on se trompe le jour où on en a besoin. Un code tiré au hasard ne
 * se devine pas, et se relit tel qu'il est écrit.
 */
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto'
import { base, transaction } from '../db'
import { ErreurMetier, journaliser, maintenant } from './commun'
import { hacher, validerMotDePasse } from './auth'

const ITERATIONS = 210_000
const LONGUEUR_CLE = 32
const DIGEST = 'sha512'

/**
 * L'alphabet du code.
 *
 * Ni I, ni L, ni O, ni U : le 1 et le I, le 0 et le O se confondent sur un
 * papier photocopié, et le U s'entend « ou » au téléphone. C'est le même
 * alphabet que les codes de licence, pour que le pharmacien n'ait pas deux
 * façons de lire à apprendre.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Quatre groupes de quatre : on les recopie sans perdre sa place. */
const GROUPES = 4
const PAR_GROUPE = 4

/** Au-delà, on n'essaie plus : c'est qu'on cherche au hasard. */
const ESSAIS_AVANT_BLOCAGE = 5
const MINUTES_DE_BLOCAGE = 15

interface LigneSecours {
  id: number
  identifiant: string
  nom_complet: string
  archived_at: string | null
  actif: number
  code_secours_hash: string | null
  code_secours_sel: string | null
  code_secours_iter: number | null
  secours_tentatives: number
  secours_bloque_jusqu_a: string | null
}

function empreinte(code: string, sel: string, iterations: number): Buffer {
  return pbkdf2Sync(normaliser(code), sel, iterations, LONGUEUR_CLE, DIGEST)
}

/**
 * Met le code sous sa forme canonique.
 *
 * Le pharmacien le recopie d'un papier : il met des espaces où il veut, oublie
 * les tirets, tape en minuscules. Rien de tout cela ne doit faire échouer une
 * récupération le jour où elle compte.
 */
export function normaliser(code: string): string {
  return code.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
}

/** Tire un code neuf, lisible et imprononçable. */
function tirer(): string {
  const octets = randomBytes(GROUPES * PAR_GROUPE)
  const lettres = Array.from(octets, (o) => ALPHABET[o % ALPHABET.length]).join('')
  const morceaux: string[] = []
  for (let i = 0; i < GROUPES; i++) {
    morceaux.push(lettres.slice(i * PAR_GROUPE, (i + 1) * PAR_GROUPE))
  }
  return morceaux.join('-')
}

/**
 * Délivre un code de secours neuf pour ce compte et renvoie sa forme lisible.
 *
 * Le code en clair ne sort que d'ici, une seule fois. L'appelant doit le
 * montrer immédiatement : personne, pas même nous, ne saura le redonner.
 */
export function engendrerCodeSecours(utilisateurId: number, parUtilisateurId: number | null): string {
  const compte = base()
    .prepare('SELECT id, identifiant, nom_complet, archived_at FROM utilisateurs WHERE id = ?')
    .get(utilisateurId) as unknown as
    | { id: number; identifiant: string; nom_complet: string; archived_at: string | null }
    | undefined

  if (!compte || compte.archived_at) {
    throw new ErreurMetier('Ce compte n’existe pas.', 'utilisateur_inconnu')
  }

  const code = tirer()
  const { hash, sel, iterations } = hacher(normaliser(code))

  transaction(() => {
    base()
      .prepare(
        `UPDATE utilisateurs
            SET code_secours_hash = ?, code_secours_sel = ?, code_secours_iter = ?,
                code_secours_cree_at = ?, code_secours_utilise_at = NULL,
                secours_tentatives = 0, secours_bloque_jusqu_a = NULL
          WHERE id = ?`
      )
      .run(hash, sel, iterations, maintenant(), utilisateurId)

    // Le code lui-meme n'entre jamais dans le journal : ce serait le rendre
    // lisible a qui consulte l'historique.
    journaliser({
      utilisateurId: parUtilisateurId,
      action: 'Code de secours délivré',
      entite: 'utilisateur',
      entiteId: utilisateurId,
      resume: `Nouveau code de secours pour ${compte.nom_complet}`,
      resultat: 'succes'
    })
  })

  return code
}

/** Ce que l'écran de connexion a besoin de savoir avant de proposer l'issue. */
export function etatCodeSecours(utilisateurId: number): {
  existe: boolean
  creeLe: string | null
  utiliseLe: string | null
} {
  const ligne = base()
    .prepare(
      'SELECT code_secours_hash, code_secours_cree_at, code_secours_utilise_at FROM utilisateurs WHERE id = ?'
    )
    .get(utilisateurId) as unknown as
    | { code_secours_hash: string | null; code_secours_cree_at: string | null; code_secours_utilise_at: string | null }
    | undefined

  return {
    existe: Boolean(ligne?.code_secours_hash),
    creeLe: ligne?.code_secours_cree_at ?? null,
    utiliseLe: ligne?.code_secours_utilise_at ?? null
  }
}

/**
 * Rouvre un compte avec son code de secours et renvoie le code suivant.
 *
 * Le message de refus est le même que l'identifiant soit inconnu ou que le code
 * soit faux : sinon, on apprendrait quels comptes existent en essayant des
 * noms au hasard.
 */
export function rouvrirAvecCodeSecours(
  identifiant: string,
  code: string,
  nouveauMotDePasse: string
): { nomComplet: string; codeSuivant: string } {
  const refus = new ErreurMetier('Identifiant ou code de secours incorrect.', 'code_secours')

  const ligne = base()
    .prepare(
      `SELECT id, identifiant, nom_complet, archived_at, actif,
              code_secours_hash, code_secours_sel, code_secours_iter,
              secours_tentatives, secours_bloque_jusqu_a
         FROM utilisateurs
        WHERE identifiant = ? COLLATE NOCASE`
    )
    .get(identifiant.trim()) as unknown as LigneSecours | undefined

  if (!ligne || ligne.archived_at || !ligne.code_secours_hash || !ligne.code_secours_sel) {
    journaliser({
      utilisateurId: null,
      action: 'Récupération refusée',
      entite: 'utilisateur',
      resume: `Tentative de récupération sur « ${identifiant} »`,
      resultat: 'refuse'
    })
    throw refus
  }

  if (ligne.secours_bloque_jusqu_a && ligne.secours_bloque_jusqu_a > maintenant()) {
    const minutes = Math.ceil((new Date(ligne.secours_bloque_jusqu_a).getTime() - Date.now()) / 60_000)
    throw new ErreurMetier(
      `Trop d’essais. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.`,
      'secours_bloque'
    )
  }

  // Le mot de passe neuf est controle AVANT de consommer le code : sinon un
  // mot de passe trop court brulerait le code du coffre pour rien.
  validerMotDePasse(nouveauMotDePasse)

  const calcule = empreinte(code, ligne.code_secours_sel, ligne.code_secours_iter ?? ITERATIONS)
  const attendu = Buffer.from(ligne.code_secours_hash, 'hex')
  const juste = calcule.length === attendu.length && timingSafeEqual(calcule, attendu)

  if (!juste) {
    const tentatives = ligne.secours_tentatives + 1
    const bloque =
      tentatives >= ESSAIS_AVANT_BLOCAGE
        ? new Date(Date.now() + MINUTES_DE_BLOCAGE * 60_000).toISOString()
        : null
    base()
      .prepare('UPDATE utilisateurs SET secours_tentatives = ?, secours_bloque_jusqu_a = ? WHERE id = ?')
      .run(tentatives, bloque, ligne.id)
    journaliser({
      utilisateurId: null,
      action: 'Récupération refusée',
      entite: 'utilisateur',
      entiteId: ligne.id,
      resume: `Code de secours incorrect pour ${ligne.nom_complet} (${tentatives} essai(s))`,
      resultat: 'refuse'
    })
    throw refus
  }

  const nouveau = hacher(nouveauMotDePasse)

  transaction(() => {
    base()
      .prepare(
        `UPDATE utilisateurs
            SET mot_de_passe_hash = ?, mot_de_passe_sel = ?, mot_de_passe_iter = ?,
                doit_changer_mdp = 0, actif = 1,
                tentatives_echouees = 0, verrouille_jusqu_a = NULL,
                secours_tentatives = 0, secours_bloque_jusqu_a = NULL,
                code_secours_utilise_at = ?
          WHERE id = ?`
      )
      .run(nouveau.hash, nouveau.sel, nouveau.iterations, maintenant(), ligne.id)

    journaliser({
      utilisateurId: ligne.id,
      action: 'Compte rouvert par code de secours',
      entite: 'utilisateur',
      entiteId: ligne.id,
      resume: `${ligne.nom_complet} a repris la main avec son code de secours`,
      resultat: 'succes'
    })
  })

  // Un code ne sert qu'une fois : le suivant est delivre tout de suite, pour
  // que l'officine ne reparte pas sans filet.
  const codeSuivant = engendrerCodeSecours(ligne.id, ligne.id)

  return { nomComplet: ligne.nom_complet, codeSuivant }
}
