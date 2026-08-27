import { base, transaction, type ValeurSQL } from '../db'
import type { Allocation, Lot, LotPeremption, MouvementStock, PalierPeremption } from '@shared/types'
import {
  ErreurMetier,
  aujourdhui,
  journaliser,
  parametreBooleen,
  parametreEntier
} from './commun'

export interface OptionsAllocation {
  /** Interdit de servir depuis un lot déjà périmé. Vrai par défaut. */
  refuserExpires?: boolean
  /** Autorise un service partiel plutôt que d'échouer. */
  autoriserPartiel?: boolean
}

/**
 * FEFO — First Expired, First Out.
 *
 * Ordre de service : date de péremption la plus proche d'abord ; les lots sans
 * date passent en dernier (ils ne périment pas, autant écouler ce qui périme) ;
 * à date égale, le lot le plus ancien. Les lots bloqués et les lots vides sont
 * exclus.
 *
 * Cette fonction ne modifie rien : elle calcule le service. C'est ce qui permet
 * de l'appeler pour prévisualiser une vente avant de la valider.
 */
export function allouerFEFO(
  produitId: number,
  quantite: number,
  options: OptionsAllocation = {}
): Allocation {
  if (quantite <= 0) throw new ErreurMetier('La quantité doit être supérieure à zéro.')

  const refuserExpires =
    options.refuserExpires ?? parametreBooleen('peremption.bloquer_vente_expire', true)

  const lots = base()
    .prepare(
      `SELECT id, numero, quantite_restante, prix_achat, date_peremption
       FROM lots
       WHERE produit_id = ? AND quantite_restante > 0 AND bloque = 0
         AND (? = 0 OR date_peremption IS NULL OR date_peremption >= ?)
       ORDER BY date_peremption IS NULL, date_peremption, id`
    )
    .all(produitId, refuserExpires ? 1 : 0, aujourdhui()) as unknown as {
    id: number
    numero: string | null
    quantite_restante: number
    prix_achat: number
    date_peremption: string | null
  }[]

  const lignes: Allocation['lignes'] = []
  let restant = quantite

  for (const lot of lots) {
    if (restant <= 0) break
    const pris = Math.min(restant, lot.quantite_restante)
    lignes.push({
      lotId: lot.id,
      numero: lot.numero,
      quantite: pris,
      prixAchat: lot.prix_achat,
      datePeremption: lot.date_peremption
    })
    restant -= pris
  }

  const servi = quantite - restant

  if (restant > 0 && !options.autoriserPartiel) {
    const nom = nomProduit(produitId)
    throw new ErreurMetier(
      `Stock insuffisant pour ${nom} : ${servi} disponible${servi > 1 ? 's' : ''} sur ${quantite} demandé${quantite > 1 ? 's' : ''}.`,
      'stock_insuffisant'
    )
  }

  return { produitId, demande: quantite, servi, lignes, manquant: restant }
}

function nomProduit(produitId: number): string {
  const p = base().prepare('SELECT nom_commercial FROM produits WHERE id = ?').get(produitId) as unknown as
    | { nom_commercial: string }
    | undefined
  return p?.nom_commercial ?? `produit #${produitId}`
}

export function stockDisponible(produitId: number): number {
  const l = base()
    .prepare('SELECT stock_disponible FROM v_stock_produit WHERE produit_id = ?')
    .get(produitId) as unknown as { stock_disponible: number } | undefined
  return l?.stock_disponible ?? 0
}

export interface ContexteMouvement {
  type: string
  motif?: string | null
  referenceType?: 'vente' | 'achat' | 'inventaire' | 'ajustement' | 'manuel' | null
  referenceId?: number | null
  utilisateurId: number
}

/**
 * Applique une allocation : décrémente les lots et écrit un mouvement par lot.
 * À appeler impérativement dans une transaction ouverte par l'appelant.
 */
export function consommerAllocation(allocation: Allocation, contexte: ContexteMouvement): void {
  for (const ligne of allocation.lignes) {
    const avant = stockDisponible(allocation.produitId)

    const maj = base()
      .prepare(
        `UPDATE lots SET quantite_restante = quantite_restante - ?
         WHERE id = ? AND quantite_restante >= ?`
      )
      .run(ligne.quantite, ligne.lotId, ligne.quantite)

    // Garde-fou contre une modification concurrente entre le calcul et l'écriture.
    if (maj.changes === 0) {
      throw new ErreurMetier(
        `Le stock de ${nomProduit(allocation.produitId)} a changé pendant l'opération. Recommencez.`,
        'conflit_stock'
      )
    }

    ecrireMouvement({
      produitId: allocation.produitId,
      lotId: ligne.lotId,
      quantite: -ligne.quantite,
      stockAvant: avant,
      stockApres: avant - ligne.quantite,
      coutUnitaire: ligne.prixAchat,
      ...contexte
    })
  }
}

interface EcritureMouvement extends ContexteMouvement {
  produitId: number
  lotId: number | null
  quantite: number
  stockAvant: number
  stockApres: number
  coutUnitaire: number
}

export function ecrireMouvement(e: EcritureMouvement): void {
  base()
    .prepare(
      `INSERT INTO mouvements_stock
         (produit_id, lot_id, type, quantite, stock_avant, stock_apres,
          cout_unitaire, motif, reference_type, reference_id, utilisateur_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      e.produitId,
      e.lotId,
      e.type,
      e.quantite,
      e.stockAvant,
      e.stockApres,
      e.coutUnitaire,
      e.motif ?? null,
      e.referenceType ?? null,
      e.referenceId ?? null,
      e.utilisateurId
    )
}

export interface EntreeStock {
  produitId: number
  quantite: number
  prixAchat: number
  numeroLot?: string | null
  datePeremption?: string | null
  fournisseurId?: number | null
  achatId?: number | null
  dateReception?: string
  motif?: string
  type?: string
  referenceType?: ContexteMouvement['referenceType']
  referenceId?: number | null
}

/**
 * Crée un lot et enregistre l'entrée. Un produit sans suivi de lot reçoit un
 * lot au numéro NULL : le stock reste toujours porté par des lots.
 */
export function entrerStock(entree: EntreeStock, utilisateurId: number): number {
  if (entree.quantite <= 0) throw new ErreurMetier('La quantité doit être supérieure à zéro.')

  const avant = stockDisponible(entree.produitId)

  const resultat = base()
    .prepare(
      `INSERT INTO lots
         (produit_id, numero, fournisseur_id, achat_id, date_reception, date_peremption,
          quantite_initiale, quantite_restante, prix_achat)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      entree.produitId,
      entree.numeroLot ?? null,
      entree.fournisseurId ?? null,
      entree.achatId ?? null,
      entree.dateReception ?? aujourdhui(),
      entree.datePeremption ?? null,
      entree.quantite,
      entree.quantite,
      entree.prixAchat
    )

  const lotId = Number(resultat.lastInsertRowid)

  ecrireMouvement({
    produitId: entree.produitId,
    lotId,
    type: entree.type ?? 'entree',
    quantite: entree.quantite,
    stockAvant: avant,
    stockApres: avant + entree.quantite,
    coutUnitaire: entree.prixAchat,
    motif: entree.motif ?? null,
    referenceType: entree.referenceType ?? 'manuel',
    referenceId: entree.referenceId ?? null,
    utilisateurId
  })

  return lotId
}

/**
 * Ajustement manuel du stock d'un lot vers une quantité comptée.
 * Un motif est exigé : un ajustement sans explication est ingérable en audit.
 */
export function ajusterLot(
  lotId: number,
  nouvelleQuantite: number,
  motif: string,
  utilisateurId: number,
  type = 'ajustement'
): void {
  if (!motif?.trim()) throw new ErreurMetier('Un motif est obligatoire pour ajuster le stock.')
  if (nouvelleQuantite < 0) throw new ErreurMetier('La quantité ne peut pas être négative.')

  const lot = base().prepare('SELECT * FROM lots WHERE id = ?').get(lotId) as unknown as Lot | undefined
  if (!lot) throw new ErreurMetier('Lot introuvable.')

  const ecart = nouvelleQuantite - lot.quantite_restante
  if (ecart === 0) return

  const avant = stockDisponible(lot.produit_id)

  // La quantité initiale suit à la hausse : un lot ne peut pas contenir
  // plus que ce qu'il a jamais contenu (contrainte du schéma).
  base()
    .prepare(
      `UPDATE lots SET quantite_restante = ?, quantite_initiale = MAX(quantite_initiale, ?) WHERE id = ?`
    )
    .run(nouvelleQuantite, nouvelleQuantite, lotId)

  ecrireMouvement({
    produitId: lot.produit_id,
    lotId,
    type,
    quantite: ecart,
    stockAvant: avant,
    stockApres: avant + ecart,
    coutUnitaire: lot.prix_achat,
    motif,
    referenceType: 'ajustement',
    referenceId: null,
    utilisateurId
  })
}

export function bloquerLot(lotId: number, bloque: boolean, motif: string | null, utilisateurId: number): void {
  if (bloque && !motif?.trim()) {
    throw new ErreurMetier('Indiquez pourquoi ce lot est bloqué.')
  }
  transaction(() => {
    base()
      .prepare('UPDATE lots SET bloque = ?, motif_blocage = ? WHERE id = ?')
      .run(bloque ? 1 : 0, bloque ? motif : null, lotId)

    const lot = base().prepare('SELECT produit_id, numero FROM lots WHERE id = ?').get(lotId) as unknown as
    | { produit_id: number; numero: string | null }
      | undefined

    journaliser({
      utilisateurId,
      action: bloque ? 'Lot bloqué' : 'Lot débloqué',
      entite: 'lot',
      entiteId: lotId,
      resume: `${nomProduit(lot?.produit_id ?? 0)} — lot ${lot?.numero ?? 'sans numéro'}${bloque ? ` : ${motif}` : ''}`
    })
  })
}

export function lotsDe(produitId: number, inclureVides = false): Lot[] {
  return base()
    .prepare(
      `SELECT l.*, f.nom AS fournisseur
       FROM lots l LEFT JOIN fournisseurs f ON f.id = l.fournisseur_id
       WHERE l.produit_id = ? ${inclureVides ? '' : 'AND l.quantite_restante > 0'}
       ORDER BY l.date_peremption IS NULL, l.date_peremption, l.id`
    )
    .all(produitId) as unknown as Lot[]
}

export function peremptions(palier?: PalierPeremption): LotPeremption[] {
  const seuil = parametreEntier('peremption.seuil_alerte_jours', 90)
  const lignes = base()
    .prepare(
      `SELECT * FROM v_peremptions
       WHERE jours_restants <= ?
       ORDER BY date_peremption, nom_commercial`
    )
    .all(seuil) as unknown as LotPeremption[]

  return palier ? lignes.filter((l) => l.palier === palier) : lignes
}

export function resumePeremptions(): Record<PalierPeremption, { lots: number; valeur: number }> {
  const vide = () => ({ lots: 0, valeur: 0 })
  const resume: Record<string, { lots: number; valeur: number }> = {
    expire: vide(),
    j7: vide(),
    j30: vide(),
    j90: vide(),
    ok: vide()
  }
  for (const l of base().prepare('SELECT palier, COUNT(*) n, SUM(valeur) v FROM v_peremptions GROUP BY palier').all() as unknown as {
    palier: PalierPeremption
    n: number
    v: number
  }[]) {
    resume[l.palier] = { lots: l.n, valeur: l.v ?? 0 }
  }
  return resume as Record<PalierPeremption, { lots: number; valeur: number }>
}

export interface FiltreMouvements {
  produitId?: number
  type?: string
  depuis?: string
  jusqua?: string
  limite?: number
}

export function mouvements(filtre: FiltreMouvements = {}): MouvementStock[] {
  const conditions: string[] = []
  const params: Record<string, ValeurSQL> = {}

  if (filtre.produitId) (conditions.push('m.produit_id = :produitId'), (params.produitId = filtre.produitId))
  if (filtre.type) (conditions.push('m.type = :type'), (params.type = filtre.type))
  if (filtre.depuis) (conditions.push('m.at >= :depuis'), (params.depuis = filtre.depuis))
  if (filtre.jusqua) (conditions.push('m.at <= :jusqua'), (params.jusqua = filtre.jusqua))
  params.limite = filtre.limite ?? 200

  return base()
    .prepare(
      `SELECT m.*, p.nom_commercial, l.numero AS numero_lot, u.nom_complet AS utilisateur
       FROM mouvements_stock m
       JOIN produits p ON p.id = m.produit_id
       LEFT JOIN lots l ON l.id = m.lot_id
       LEFT JOIN utilisateurs u ON u.id = m.utilisateur_id
       ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
       ORDER BY m.at DESC, m.id DESC
       LIMIT :limite`
    )
    .all(params) as unknown as MouvementStock[]
}

/** Sortie de stock hors vente : perte, casse, don, retour fournisseur. */
export function sortirStock(
  produitId: number,
  quantite: number,
  type: 'perte' | 'peremption' | 'sortie' | 'retour_fournisseur',
  motif: string,
  utilisateurId: number
): Allocation {
  if (!motif?.trim()) throw new ErreurMetier('Un motif est obligatoire pour une sortie de stock.')

  return transaction(() => {
    // Une sortie pour péremption doit pouvoir puiser dans les lots périmés.
    const allocation = allouerFEFO(produitId, quantite, {
      refuserExpires: type !== 'peremption' && type !== 'perte'
    })

    consommerAllocation(allocation, {
      type,
      motif,
      referenceType: 'manuel',
      utilisateurId
    })

    journaliser({
      utilisateurId,
      action: 'Sortie de stock',
      entite: 'produit',
      entiteId: produitId,
      resume: `${nomProduit(produitId)} — ${quantite} unité(s), ${type} : ${motif}`
    })

    return allocation
  })
}
