/**
 * Engendrer un code-barres quand la boîte n'en porte pas.
 *
 * LE BESOIN
 *
 * Beaucoup de produits arrivent sans code lisible : conditionnement local,
 * étiquette arrachée, générique importé en vrac, préparation de l'officine.
 * Sans code, chaque vente passe par une recherche au clavier — trois secondes
 * de plus, à chaque boîte, toute la journée.
 *
 * Le logiciel fabrique donc un code, l'officine l'imprime et le colle. À
 * partir de là, la boîte se scanne comme les autres.
 *
 * POURQUOI UN EAN-13, ET POURQUOI COMMENÇANT PAR 2
 *
 * On pourrait inventer un format maison. Ce serait une erreur : les douchettes
 * du commerce lisent l'EAN-13, et rien ne garantit qu'elles liront autre chose.
 * Un EAN-13 valide, chiffre de contrôle compris, se scanne avec n'importe quel
 * lecteur, sans réglage.
 *
 * GS1 réserve les préfixes 20 à 29 à l'usage interne d'un commerce : ces codes
 * ne circulent pas, ne sont attribués à aucun fabricant, et ne peuvent donc
 * jamais entrer en conflit avec le code d'un vrai médicament. C'est exactement
 * notre cas.
 *
 * Le code est dérivé de l'identifiant du produit : deux produits n'obtiennent
 * jamais le même, et le même produit réinterrogé retrouve le sien.
 */
import { base, transaction } from '../db'
import { ErreurMetier, journaliser } from './commun'

/**
 * Chiffre de contrôle d'un EAN-13.
 *
 * Rang impair au poids 1, rang pair au poids 3, en partant de la gauche. C'est
 * lui qui permet à une douchette de rejeter une lecture douteuse plutôt que de
 * transmettre un code faux — dans une officine, un code faux, c'est le mauvais
 * médicament dans le sachet.
 */
export function chiffreControleEan13(douzeChiffres: string): number {
  if (!/^\d{12}$/.test(douzeChiffres)) {
    throw new ErreurMetier('Un EAN-13 se calcule sur douze chiffres.')
  }
  let somme = 0
  for (let i = 0; i < 12; i++) {
    somme += Number(douzeChiffres[i]) * (i % 2 === 0 ? 1 : 3)
  }
  return (10 - (somme % 10)) % 10
}

/** Vrai si la chaîne est un EAN-13 complet et cohérent. */
export function estEan13Valide(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false
  return chiffreControleEan13(code.slice(0, 12)) === Number(code[12])
}

/** Vrai si ce code a été fabriqué par l'officine plutôt que lu sur une boîte. */
export function estCodeInterne(code: string): boolean {
  return /^2\d{12}$/.test(code)
}

/**
 * Le code interne d'un produit, calculé et non tiré au sort.
 *
 * Préfixe 2, puis l'identifiant du produit sur onze chiffres, puis le chiffre
 * de contrôle. Réinterroger le même produit redonne le même code : réimprimer
 * une étiquette perdue ne crée pas un second code pour la même boîte.
 */
export function codeInternePour(produitId: number): string {
  if (!Number.isInteger(produitId) || produitId <= 0 || produitId > 99_999_999_999) {
    throw new ErreurMetier('Identifiant de produit hors des bornes attendues.')
  }
  const douze = `2${String(produitId).padStart(11, '0')}`
  return `${douze}${chiffreControleEan13(douze)}`
}

export interface CodeEngendre {
  code: string
  /** Faux si le produit portait déjà ce code : rien n'a été écrit. */
  nouveau: boolean
}

/**
 * Attribue au produit son code interne, s'il n'en a pas déjà un.
 *
 * Ne touche jamais aux codes lus sur les boîtes : un produit peut porter à la
 * fois le code du fabricant et celui de l'officine, et c'est même le cas
 * courant — la boîte du grossiste garde le sien, celle reconditionnée reçoit
 * l'étiquette maison.
 */
export function engendrerCodeInterne(produitId: number, utilisateurId: number): CodeEngendre {
  return transaction(() => {
    const produit = base()
      .prepare('SELECT nom_commercial FROM produits WHERE id = ? AND archived_at IS NULL')
      .get(produitId) as { nom_commercial: string } | undefined
    if (!produit) throw new ErreurMetier('Produit introuvable.')

    const code = codeInternePour(produitId)

    const existant = base()
      .prepare('SELECT produit_id FROM produit_codes_barres WHERE code = ?')
      .get(code) as { produit_id: number } | undefined

    if (existant) {
      // Le code est calculé depuis l'identifiant : s'il existe, il est
      // forcément à ce produit-là. On le redonne sans rien réécrire.
      if (existant.produit_id === produitId) return { code, nouveau: false }
      throw new ErreurMetier('Ce code interne appartient déjà à un autre produit.')
    }

    // Le code maison ne devient principal que si le produit n'avait rien : le
    // code du fabricant, quand il existe, reste la référence.
    const dejaUn = base()
      .prepare('SELECT COUNT(*) n FROM produit_codes_barres WHERE produit_id = ?')
      .get(produitId) as { n: number }

    base()
      .prepare('INSERT INTO produit_codes_barres (code, produit_id, principal) VALUES (?, ?, ?)')
      .run(code, produitId, dejaUn.n === 0 ? 1 : 0)

    journaliser({
      utilisateurId,
      action: 'Code-barres engendré',
      entite: 'produit',
      entiteId: produitId,
      resume: `${produit.nom_commercial} — ${code}`
    })

    return { code, nouveau: true }
  })
}

/**
 * Les produits dont une étiquette est à imprimer.
 *
 * On ne propose que les codes internes : réimprimer le code du fabricant
 * n'aurait aucun sens, il est déjà sur la boîte.
 */
export function produitsAEtiqueter(limite = 200): {
  produitId: number
  nom: string
  dosage: string | null
  code: string
  prixVente: number
  emplacement: string | null
}[] {
  return base()
    .prepare(
      `SELECT p.id AS produitId, p.nom_commercial AS nom, p.dosage, cb.code,
              p.prix_vente AS prixVente, p.emplacement
       FROM produit_codes_barres cb
       JOIN produits p ON p.id = cb.produit_id
       WHERE p.archived_at IS NULL AND cb.code LIKE '2%' AND LENGTH(cb.code) = 13
       ORDER BY p.nom_commercial
       LIMIT ?`
    )
    .all(limite) as unknown as {
    produitId: number
    nom: string
    dosage: string | null
    code: string
    prixVente: number
    emplacement: string | null
  }[]
}
