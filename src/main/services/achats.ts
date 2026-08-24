import type { SQLInputValue } from 'node:sqlite'
import { base, transaction } from '../db'
import type { Achat, LigneReception } from '@shared/types'
import { ErreurMetier, aujourdhui, journaliser, maintenant, prochaineReference } from './commun'
import { entrerStock } from './stock'
import { rafraichirAlertes } from './alertes'

export interface DemandeAchat {
  fournisseurId: number
  lignes: LigneReception[]
  remise?: number
  taxe?: number
  frais?: number
  montantPaye?: number
  modePaiement?: 'especes' | 'mobile_money' | 'carte' | 'virement' | 'cheque'
  dateReception?: string
  note?: string | null
}

/**
 * Enregistre une réception : crée l'achat, crée un lot par ligne, met le stock
 * à jour et enregistre la dette fournisseur. Tout se fait dans une seule
 * transaction — une réception à moitié enregistrée serait pire que pas de
 * réception du tout.
 */
export function enregistrerReception(demande: DemandeAchat, utilisateurId: number): Achat {
  if (!demande.lignes.length) throw new ErreurMetier('Ajoutez au moins un produit à la réception.')

  const fournisseur = base()
    .prepare('SELECT nom FROM fournisseurs WHERE id = ? AND archived_at IS NULL')
    .get(demande.fournisseurId) as unknown as { nom: string } | undefined
  if (!fournisseur) throw new ErreurMetier('Fournisseur introuvable.', 'fournisseurId')

  for (const ligne of demande.lignes) {
    if (ligne.quantite <= 0) throw new ErreurMetier('Chaque ligne doit porter sur au moins une unité.')
    if (ligne.prixAchat < 0) throw new ErreurMetier('Un prix d’achat ne peut pas être négatif.')

    const produit = base()
      .prepare('SELECT nom_commercial, suivi_peremption FROM produits WHERE id = ? AND archived_at IS NULL')
      .get(ligne.produitId) as unknown as { nom_commercial: string; suivi_peremption: number } | undefined
    if (!produit) throw new ErreurMetier(`Produit introuvable (#${ligne.produitId}).`)

    if (ligne.datePeremption && ligne.datePeremption < aujourdhui()) {
      throw new ErreurMetier(
        `${produit.nom_commercial} : la date de péremption saisie (${ligne.datePeremption}) est déjà dépassée.`,
        'date_peremption'
      )
    }
  }

  const sousTotal = demande.lignes.reduce((s, l) => s + l.quantite * l.prixAchat, 0)
  const total = sousTotal - (demande.remise ?? 0) + (demande.taxe ?? 0) + (demande.frais ?? 0)
  if (total < 0) throw new ErreurMetier('Le total de la réception ne peut pas être négatif.')

  const montantPaye = demande.montantPaye ?? 0
  if (montantPaye < 0) throw new ErreurMetier('Le montant payé ne peut pas être négatif.')
  if (montantPaye > total) throw new ErreurMetier('Le montant payé dépasse le total de la réception.')

  return transaction(() => {
    const reference = prochaineReference('A', 'achats')
    const date = demande.dateReception ?? aujourdhui()

    const resultat = base()
      .prepare(
        `INSERT INTO achats
           (reference, fournisseur_id, statut, date_commande, date_reception,
            sous_total, remise, taxe, frais, total, montant_paye, note,
            created_by, validated_at, validated_by)
         VALUES (?, ?, 'recu', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        reference,
        demande.fournisseurId,
        date,
        date,
        sousTotal,
        demande.remise ?? 0,
        demande.taxe ?? 0,
        demande.frais ?? 0,
        total,
        montantPaye,
        demande.note ?? null,
        utilisateurId,
        maintenant(),
        utilisateurId
      )

    const achatId = Number(resultat.lastInsertRowid)

    for (const ligne of demande.lignes) {
      base()
        .prepare(
          `INSERT INTO achat_lignes
             (achat_id, produit_id, quantite, quantite_recue, prix_achat, numero_lot, date_peremption, montant)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          achatId,
          ligne.produitId,
          ligne.quantite,
          ligne.quantite,
          ligne.prixAchat,
          ligne.numeroLot ?? null,
          ligne.datePeremption ?? null,
          ligne.quantite * ligne.prixAchat
        )

      entrerStock(
        {
          produitId: ligne.produitId,
          quantite: ligne.quantite,
          prixAchat: ligne.prixAchat,
          numeroLot: ligne.numeroLot ?? null,
          datePeremption: ligne.datePeremption ?? null,
          fournisseurId: demande.fournisseurId,
          achatId,
          dateReception: date,
          type: 'entree',
          motif: `Réception ${reference}`,
          referenceType: 'achat',
          referenceId: achatId
        },
        utilisateurId
      )

      // Le dernier prix d'achat connu alimente la valorisation du stock
      // et le calcul de marge affiché sur la fiche produit.
      base().prepare('UPDATE produits SET prix_achat = ? WHERE id = ?').run(ligne.prixAchat, ligne.produitId)
    }

    if (montantPaye > 0) {
      base()
        .prepare('INSERT INTO achat_paiements (achat_id, montant, mode, created_by) VALUES (?, ?, ?, ?)')
        .run(achatId, montantPaye, demande.modePaiement ?? 'especes', utilisateurId)
    }

    journaliser({
      utilisateurId,
      action: 'Réception enregistrée',
      entite: 'achat',
      entiteId: achatId,
      resume: `${reference} — ${fournisseur.nom}, ${demande.lignes.length} ligne(s), total ${total}`,
      details: { total, montantPaye, reste: total - montantPaye }
    })

    rafraichirAlertes()

    return achat(achatId)!
  })
}

export function payerAchat(
  achatId: number,
  montant: number,
  mode: 'especes' | 'mobile_money' | 'carte' | 'virement' | 'cheque',
  reference: string | null,
  utilisateurId: number
): void {
  if (montant <= 0) throw new ErreurMetier('Le montant doit être supérieur à zéro.')

  const a = base().prepare('SELECT reference, total, montant_paye FROM achats WHERE id = ?').get(achatId) as unknown as
    | { reference: string; total: number; montant_paye: number }
    | undefined
  if (!a) throw new ErreurMetier('Achat introuvable.')

  const reste = a.total - a.montant_paye
  if (montant > reste) {
    throw new ErreurMetier(`Le paiement (${montant}) dépasse le reste dû (${reste}).`, 'montant_excessif')
  }

  transaction(() => {
    base()
      .prepare('INSERT INTO achat_paiements (achat_id, montant, mode, reference, created_by) VALUES (?, ?, ?, ?, ?)')
      .run(achatId, montant, mode, reference, utilisateurId)

    base().prepare('UPDATE achats SET montant_paye = montant_paye + ? WHERE id = ?').run(montant, achatId)

    journaliser({
      utilisateurId,
      action: 'Paiement fournisseur',
      entite: 'achat',
      entiteId: achatId,
      resume: `${a.reference} — ${montant} en ${mode}`
    })

    rafraichirAlertes()
  })
}

export interface FiltreAchats {
  fournisseurId?: number
  statut?: string
  depuis?: string
  jusqua?: string
  impayes?: boolean
  limite?: number
}

export function listerAchats(filtre: FiltreAchats = {}): Achat[] {
  const conditions: string[] = []
  const params: Record<string, SQLInputValue> = { limite: filtre.limite ?? 100 }

  if (filtre.fournisseurId) (conditions.push('a.fournisseur_id = :fournisseurId'), (params.fournisseurId = filtre.fournisseurId))
  if (filtre.statut) (conditions.push('a.statut = :statut'), (params.statut = filtre.statut))
  if (filtre.depuis) (conditions.push('a.date_reception >= :depuis'), (params.depuis = filtre.depuis))
  if (filtre.jusqua) (conditions.push('a.date_reception <= :jusqua'), (params.jusqua = filtre.jusqua))
  if (filtre.impayes) conditions.push('a.montant_paye < a.total')

  return base()
    .prepare(
      `SELECT a.*, f.nom AS fournisseur,
              (SELECT COUNT(*) FROM achat_lignes WHERE achat_id = a.id) AS nb_lignes
       FROM achats a JOIN fournisseurs f ON f.id = a.fournisseur_id
       ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
       ORDER BY a.date_reception DESC, a.id DESC LIMIT :limite`
    )
    .all(params) as unknown as Achat[]
}

export function achat(id: number): (Achat & {
  lignes: {
    id: number
    produit_id: number
    nom_commercial: string
    quantite: number
    prix_achat: number
    numero_lot: string | null
    date_peremption: string | null
    montant: number
  }[]
  paiements: { at: string; montant: number; mode: string; reference: string | null }[]
}) | null {
  const a = base()
    .prepare(
      `SELECT a.*, f.nom AS fournisseur FROM achats a
       JOIN fournisseurs f ON f.id = a.fournisseur_id WHERE a.id = ?`
    )
    .get(id) as unknown as Achat | undefined
  if (!a) return null

  const lignes = base()
    .prepare(
      `SELECT al.id, al.produit_id, p.nom_commercial, al.quantite, al.prix_achat,
              al.numero_lot, al.date_peremption, al.montant
       FROM achat_lignes al JOIN produits p ON p.id = al.produit_id
       WHERE al.achat_id = ? ORDER BY al.id`
    )
    .all(id) as unknown as never

  const paiements = base()
    .prepare('SELECT at, montant, mode, reference FROM achat_paiements WHERE achat_id = ? ORDER BY at')
    .all(id) as unknown as never

  return { ...a, lignes, paiements }
}

/**
 * Suggestion de réapprovisionnement : produits sous le seuil, avec la quantité
 * à commander et le fournisseur qui les a livrés en dernier.
 */
export function suggestionsReapprovisionnement(): {
  produit_id: number
  nom_commercial: string
  stock_disponible: number
  stock_min: number
  a_commander: number
  fournisseur_id: number | null
  fournisseur: string | null
  dernier_prix: number
}[] {
  return base()
    .prepare(
      `SELECT e.id AS produit_id, e.nom_commercial, e.stock_disponible, e.stock_min,
              MAX(COALESCE(e.stock_max, e.stock_min * 3) - e.stock_disponible, e.stock_min) AS a_commander,
              d.fournisseur_id, f.nom AS fournisseur,
              COALESCE(d.prix_achat, e.prix_achat) AS dernier_prix
       FROM v_produit_etat e
       LEFT JOIN (
         SELECT l.produit_id, l.fournisseur_id, l.prix_achat,
                ROW_NUMBER() OVER (PARTITION BY l.produit_id ORDER BY l.date_reception DESC, l.id DESC) rn
         FROM lots l WHERE l.fournisseur_id IS NOT NULL
       ) d ON d.produit_id = e.id AND d.rn = 1
       LEFT JOIN fournisseurs f ON f.id = d.fournisseur_id
       WHERE e.archived_at IS NULL AND e.vente_autorisee = 1
         AND e.etat_stock IN ('rupture', 'faible')
       GROUP BY e.id
       ORDER BY e.etat_stock = 'rupture' DESC, e.nom_commercial`
    )
    .all() as unknown as never
}
