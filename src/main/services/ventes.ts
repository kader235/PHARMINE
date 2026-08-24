import { base, transaction } from '../db'
import type {
  Allocation,
  Avertissement,
  DemandeVente,
  Vente,
  VenteDetail,
  VenteLigne
} from '@shared/types'
import {
  ErreurMetier,
  aujourdhui,
  decalerJours,
  journaliser,
  maintenant,
  parametreBooleen,
  parametreEntier,
  prochaineReference
} from './commun'
import { allouerFEFO, consommerAllocation, ecrireMouvement, stockDisponible } from './stock'
import { encaisser, sessionOuverte } from './caisse'
import { rafraichirAlertes } from './alertes'

interface LignePreparee {
  produitId: number
  designation: string
  quantite: number
  prixUnitaire: number
  remise: number
  tauxTva: number
  montant: number
  allocation: Allocation
}

interface Preparation {
  lignes: LignePreparee[]
  sousTotal: number
  remise: number
  taxe: number
  total: number
  totalPaye: number
  monnaieRendue: number
  resteAPayer: number
  avertissements: Avertissement[]
}

/**
 * Prépare une vente sans rien écrire : calcule les totaux, alloue les lots en
 * FEFO et rassemble les avertissements.
 *
 * Les avertissements « bloquants » interdisent la finalisation ; les autres
 * sont affichés à l'utilisateur, qui décide. C'est la prévention d'erreur
 * demandée par le cahier des charges : le logiciel alerte, il n'infantilise pas.
 */
function preparer(demande: DemandeVente, permissions: Set<string>): Preparation {
  const avertissements: Avertissement[] = []

  if (!demande.lignes.length) {
    throw new ErreurMetier('Le panier est vide.', 'panier_vide')
  }

  if (parametreBooleen('caisse.exiger_ouverture', true) && !sessionOuverte()) {
    avertissements.push({
      code: 'caisse_fermee',
      bloquant: true,
      message: 'Aucune caisse ouverte.',
      detail: 'Ouvrez la caisse avant d’enregistrer une vente.'
    })
  }

  const seuilProche = parametreEntier('peremption.seuil_alerte_jours', 90)
  const bloquerExpires = parametreBooleen('peremption.bloquer_vente_expire', true)
  const avertirProche = parametreBooleen('peremption.avertir_vente_proche', true)
  const avertirQuantite = parametreBooleen('stock.avertir_quantite_inhabituelle', true)

  const lignes: LignePreparee[] = []
  let sousTotal = 0
  let remiseTotale = demande.remiseGlobale ?? 0
  let taxe = 0

  // Regroupe les demandes portant sur un même produit : deux lignes du même
  // produit ne doivent pas s'allouer chacune tout le stock.
  const regroupees = new Map<number, { quantite: number; prixUnitaire?: number; remise: number }>()
  for (const l of demande.lignes) {
    const existante = regroupees.get(l.produitId)
    if (existante) {
      existante.quantite += l.quantite
      existante.remise += l.remise ?? 0
    } else {
      regroupees.set(l.produitId, {
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        remise: l.remise ?? 0
      })
    }
  }

  for (const [produitId, demandee] of regroupees) {
    if (demandee.quantite <= 0) {
      throw new ErreurMetier('Chaque ligne doit porter sur au moins une unité.')
    }

    const produit = base()
      .prepare(
        `SELECT id, nom_commercial, dosage, prix_vente, taux_tva, ordonnance_requise,
                vente_autorisee, archived_at
         FROM produits WHERE id = ?`
      )
      .get(produitId) as
      | {
          id: number
          nom_commercial: string
          dosage: string | null
          prix_vente: number
          taux_tva: number
          ordonnance_requise: number
          vente_autorisee: number
          archived_at: string | null
        }
      | undefined

    if (!produit || produit.archived_at) {
      throw new ErreurMetier(`Produit introuvable (#${produitId}).`, 'produit_introuvable')
    }

    if (!produit.vente_autorisee) {
      avertissements.push({
        code: 'vente_non_autorisee',
        bloquant: true,
        produitId,
        message: `${produit.nom_commercial} n’est pas autorisé à la vente.`
      })
    }

    const disponible = stockDisponible(produitId)
    if (disponible < demandee.quantite) {
      avertissements.push({
        code: 'stock_insuffisant',
        bloquant: true,
        produitId,
        message: `Stock insuffisant pour ${produit.nom_commercial}.`,
        detail: `${disponible} disponible${disponible > 1 ? 's' : ''} pour ${demandee.quantite} demandé${demandee.quantite > 1 ? 's' : ''}.`
      })
    }

    // Lots périmés : signalés même lorsque le paramètre les exclut du service,
    // pour que l'utilisateur comprenne pourquoi le stock semble manquer.
    const expires = base()
      .prepare(
        `SELECT COUNT(*) n, COALESCE(SUM(quantite_restante), 0) q FROM lots
         WHERE produit_id = ? AND quantite_restante > 0 AND bloque = 0
           AND date_peremption IS NOT NULL AND date_peremption < ?`
      )
      .get(produitId, aujourdhui()) as { n: number; q: number }

    if (expires.n > 0) {
      avertissements.push({
        code: 'produit_expire',
        bloquant: bloquerExpires ? false : true,
        produitId,
        message: `${produit.nom_commercial} : ${expires.q} unité(s) périmée(s) en rayon.`,
        detail: bloquerExpires
          ? 'Ces unités sont automatiquement écartées de la vente. Retirez-les du rayon.'
          : 'La vente de produits périmés est autorisée dans les paramètres. Vérifiez avant de continuer.'
      })
    }

    let allocation: Allocation
    try {
      allocation = allouerFEFO(produitId, demandee.quantite, { autoriserPartiel: true })
    } catch {
      allocation = { produitId, demande: demandee.quantite, servi: 0, lignes: [], manquant: demandee.quantite }
    }

    if (avertirProche) {
      const limite = decalerJours(aujourdhui(), seuilProche)
      const proche = allocation.lignes.find(
        (l) => l.datePeremption !== null && l.datePeremption <= limite
      )
      if (proche) {
        avertissements.push({
          code: 'peremption_proche',
          bloquant: false,
          produitId,
          message: `${produit.nom_commercial} : lot ${proche.numero ?? 'sans numéro'} expire le ${proche.datePeremption}.`,
          detail: 'Ce lot est servi en priorité, conformément au principe premier périmé, premier sorti.'
        })
      }
    }

    if (produit.ordonnance_requise) {
      avertissements.push({
        code: 'ordonnance_requise',
        bloquant: false,
        produitId,
        message: `${produit.nom_commercial} est soumis à ordonnance.`,
        detail: 'Vérifiez la prescription avant de délivrer.'
      })
    }

    if (avertirQuantite && demandee.quantite >= 10) {
      const habituelle = base()
        .prepare(
          `SELECT AVG(quantite) m FROM vente_lignes vl
           JOIN ventes v ON v.id = vl.vente_id
           WHERE vl.produit_id = ? AND v.statut = 'finalisee' AND v.at >= ?`
        )
        .get(produitId, decalerJours(aujourdhui(), -90) + 'T00:00:00.000Z') as { m: number | null }

      if (habituelle.m !== null && demandee.quantite > habituelle.m * 5) {
        avertissements.push({
          code: 'quantite_inhabituelle',
          bloquant: false,
          produitId,
          message: `Quantité inhabituelle pour ${produit.nom_commercial} : ${demandee.quantite} unités.`,
          detail: `La quantité habituelle est d’environ ${Math.round(habituelle.m)} par vente.`
        })
      }
    }

    const prixUnitaire = demandee.prixUnitaire ?? produit.prix_vente
    const brut = prixUnitaire * demandee.quantite
    const montant = brut - demandee.remise

    if (montant < 0) throw new ErreurMetier('Une remise ne peut pas dépasser le montant de la ligne.')

    sousTotal += brut
    remiseTotale += demandee.remise
    // Prix TTC : on isole la part de taxe pour les rapports.
    taxe += Math.round((montant * produit.taux_tva) / (10_000 + produit.taux_tva))

    lignes.push({
      produitId,
      designation: [produit.nom_commercial, produit.dosage].filter(Boolean).join(' '),
      quantite: demandee.quantite,
      prixUnitaire,
      remise: demandee.remise,
      tauxTva: produit.taux_tva,
      montant,
      allocation
    })
  }

  const total = sousTotal - remiseTotale
  if (total < 0) throw new ErreurMetier('Le total de la vente ne peut pas être négatif.')

  if (remiseTotale > 0) {
    const maxPourcent = parametreEntier('ventes.remise_max_pourcent', 10)
    const pourcent = sousTotal > 0 ? (remiseTotale * 100) / sousTotal : 0
    if (!permissions.has('ventes.remise')) {
      avertissements.push({
        code: 'remise_excessive',
        bloquant: true,
        message: 'Vous n’êtes pas autorisé à appliquer une remise.'
      })
    } else if (pourcent > maxPourcent) {
      avertissements.push({
        code: 'remise_excessive',
        bloquant: true,
        message: `Remise de ${pourcent.toFixed(1)} %, au-delà du maximum autorisé (${maxPourcent} %).`
      })
    }
  }

  const totalPaye = demande.paiements
    .filter((p) => p.mode !== 'credit')
    .reduce((s, p) => s + p.montant, 0)

  if (demande.paiements.some((p) => p.montant <= 0)) {
    throw new ErreurMetier('Chaque paiement doit être supérieur à zéro.')
  }

  const monnaieRendue = Math.max(0, totalPaye - total)
  const resteAPayer = Math.max(0, total - totalPaye)

  if (resteAPayer > 0) {
    if (!permissions.has('ventes.credit')) {
      avertissements.push({
        code: 'plafond_credit',
        bloquant: true,
        message: 'Vous n’êtes pas autorisé à vendre à crédit.',
        detail: `Il manque ${resteAPayer} sur un total de ${total}.`
      })
    } else if (!demande.clientId) {
      avertissements.push({
        code: 'plafond_credit',
        bloquant: true,
        message: 'Une vente à crédit doit être rattachée à un client.',
        detail: 'Sélectionnez le client avant de finaliser.'
      })
    } else {
      const client = base()
        .prepare('SELECT nom, plafond_credit FROM clients WHERE id = ?')
        .get(demande.clientId) as { nom: string; plafond_credit: number } | undefined
      const solde = (
        base()
          .prepare('SELECT COALESCE(solde_du, 0) s FROM v_creance_client WHERE client_id = ?')
          .get(demande.clientId) as { s: number } | undefined
      )?.s ?? 0

      if (client && client.plafond_credit > 0 && solde + resteAPayer > client.plafond_credit) {
        avertissements.push({
          code: 'plafond_credit',
          bloquant: true,
          message: `Plafond de crédit dépassé pour ${client.nom}.`,
          detail: `Encours actuel ${solde}, plafond ${client.plafond_credit}, nouvelle créance ${resteAPayer}.`
        })
      }
    }
  }

  return {
    lignes,
    sousTotal,
    remise: remiseTotale,
    taxe,
    total,
    totalPaye,
    monnaieRendue,
    resteAPayer,
    avertissements
  }
}

/** Contrôle une vente sans l'enregistrer : alimente l'écran de caisse. */
export function verifierVente(
  demande: DemandeVente,
  permissions: string[]
): { avertissements: Avertissement[]; total: number; sousTotal: number; remise: number; monnaieRendue: number; resteAPayer: number } {
  const p = preparer(demande, new Set(permissions))
  return {
    avertissements: p.avertissements,
    total: p.total,
    sousTotal: p.sousTotal,
    remise: p.remise,
    monnaieRendue: p.monnaieRendue,
    resteAPayer: p.resteAPayer
  }
}

export function enregistrerVente(
  demande: DemandeVente,
  utilisateurId: number,
  permissions: string[]
): VenteDetail {
  const preparation = preparer(demande, new Set(permissions))

  const bloquants = preparation.avertissements.filter((a) => a.bloquant)
  if (bloquants.length) {
    throw new ErreurMetier(bloquants[0]!.message, bloquants[0]!.code, bloquants[0]!.detail)
  }

  const session = sessionOuverte()

  return transaction(() => {
    const reference = prochaineReference('V', 'ventes')

    const resultat = base()
      .prepare(
        `INSERT INTO ventes
           (reference, caisse_session_id, client_id, utilisateur_id, at, statut,
            sous_total, remise, taxe, total, cout_total, montant_recu, monnaie_rendue,
            reste_a_payer, note)
         VALUES (?, ?, ?, ?, ?, 'finalisee', ?, ?, ?, ?, 0, ?, ?, ?, ?)`
      )
      .run(
        reference,
        session?.id ?? null,
        demande.clientId ?? null,
        utilisateurId,
        maintenant(),
        preparation.sousTotal,
        preparation.remise,
        preparation.taxe,
        preparation.total,
        preparation.totalPaye,
        preparation.monnaieRendue,
        preparation.resteAPayer,
        demande.note ?? null
      )

    const venteId = Number(resultat.lastInsertRowid)
    let coutTotal = 0

    for (const ligne of preparation.lignes) {
      // Réallocation à l'intérieur de la transaction : c'est cette allocation
      // qui fait foi, pas celle calculée pendant la préparation.
      const allocation = allouerFEFO(ligne.produitId, ligne.quantite)

      consommerAllocation(allocation, {
        type: 'vente',
        referenceType: 'vente',
        referenceId: venteId,
        utilisateurId
      })

      // Une ligne de vente par lot servi : la traçabilité est réelle.
      for (const part of allocation.lignes) {
        const proportion = part.quantite / ligne.quantite
        const montantPart = Math.round(ligne.montant * proportion)
        const remisePart = Math.round(ligne.remise * proportion)
        coutTotal += part.prixAchat * part.quantite

        base()
          .prepare(
            `INSERT INTO vente_lignes
               (vente_id, produit_id, lot_id, designation, quantite, prix_unitaire,
                remise, taux_tva, montant, cout_unitaire)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            venteId,
            ligne.produitId,
            part.lotId,
            ligne.designation,
            part.quantite,
            ligne.prixUnitaire,
            remisePart,
            ligne.tauxTva,
            montantPart,
            part.prixAchat
          )
      }
    }

    base().prepare('UPDATE ventes SET cout_total = ? WHERE id = ?').run(coutTotal, venteId)

    for (const paiement of demande.paiements) {
      if (paiement.mode === 'credit') continue
      base()
        .prepare('INSERT INTO vente_paiements (vente_id, mode, montant, reference) VALUES (?, ?, ?, ?)')
        .run(venteId, paiement.mode, paiement.montant, paiement.reference ?? null)

      if (session) {
        // La monnaie rendue est déduite du dernier encaissement en espèces.
        const montantCaisse =
          paiement.mode === 'especes'
            ? paiement.montant - preparation.monnaieRendue
            : paiement.montant
        if (montantCaisse > 0) {
          encaisser(session.id, paiement.mode, montantCaisse, venteId, utilisateurId)
        }
      }
    }

    if (preparation.resteAPayer > 0) {
      base()
        .prepare('INSERT INTO vente_paiements (vente_id, mode, montant) VALUES (?, ?, ?)')
        .run(venteId, 'credit', preparation.resteAPayer)
    }

    journaliser({
      utilisateurId,
      action: 'Vente enregistrée',
      entite: 'vente',
      entiteId: venteId,
      resume: `${reference} — ${preparation.total}${preparation.resteAPayer > 0 ? ` (crédit ${preparation.resteAPayer})` : ''}`,
      details: { articles: preparation.lignes.length, total: preparation.total }
    })

    rafraichirAlertes()

    return detailVente(venteId)!
  })
}

export function annulerVente(venteId: number, motif: string, utilisateurId: number): void {
  if (!motif?.trim()) throw new ErreurMetier('Un motif d’annulation est obligatoire.')

  const vente = base().prepare('SELECT * FROM ventes WHERE id = ?').get(venteId) as Vente | undefined
  if (!vente) throw new ErreurMetier('Vente introuvable.')
  if (vente.statut !== 'finalisee') throw new ErreurMetier('Cette vente est déjà annulée.')

  transaction(() => {
    const lignes = base()
      .prepare('SELECT * FROM vente_lignes WHERE vente_id = ?')
      .all(venteId) as VenteLigne[]

    // Le stock retourne dans son lot d'origine : après annulation, la
    // traçabilité des lots reste exacte.
    for (const ligne of lignes) {
      if (ligne.lot_id === null) continue
      const avant = stockDisponible(ligne.produit_id)

      base()
        .prepare('UPDATE lots SET quantite_restante = quantite_restante + ? WHERE id = ?')
        .run(ligne.quantite, ligne.lot_id)

      ecrireMouvement({
        produitId: ligne.produit_id,
        lotId: ligne.lot_id,
        type: 'annulation_vente',
        quantite: ligne.quantite,
        stockAvant: avant,
        stockApres: avant + ligne.quantite,
        coutUnitaire: ligne.cout_unitaire,
        motif,
        referenceType: 'vente',
        referenceId: venteId,
        utilisateurId
      })
    }

    const session = sessionOuverte()
    if (session && vente.caisse_session_id === session.id) {
      const especes = (
        base()
          .prepare(
            `SELECT COALESCE(SUM(montant), 0) s FROM caisse_mouvements
             WHERE reference_type = 'vente' AND reference_id = ?`
          )
          .get(venteId) as { s: number }
      ).s
      if (especes > 0) {
        base()
          .prepare(
            `INSERT INTO caisse_mouvements
               (session_id, type, montant, mode, motif, reference_type, reference_id, utilisateur_id)
             VALUES (?, 'remboursement', ?, 'especes', ?, 'vente', ?, ?)`
          )
          .run(session.id, -especes, `Annulation ${vente.reference} : ${motif}`, venteId, utilisateurId)
      }
    }

    base()
      .prepare(
        `UPDATE ventes SET statut = 'annulee', annulee_at = ?, annulee_par = ?, motif_annulation = ?
         WHERE id = ?`
      )
      .run(maintenant(), utilisateurId, motif, venteId)

    journaliser({
      utilisateurId,
      action: 'Vente annulée',
      entite: 'vente',
      entiteId: venteId,
      resume: `${vente.reference} — ${motif}`
    })

    rafraichirAlertes()
  })
}

export interface FiltreVentes {
  depuis?: string
  jusqua?: string
  clientId?: number
  utilisateurId?: number
  statut?: string
  recherche?: string
  limite?: number
}

export function listerVentes(filtre: FiltreVentes = {}): Vente[] {
  const conditions: string[] = []
  const params: Record<string, unknown> = { limite: filtre.limite ?? 100 }

  if (filtre.depuis) (conditions.push('v.at >= :depuis'), (params.depuis = filtre.depuis))
  if (filtre.jusqua) (conditions.push('v.at <= :jusqua'), (params.jusqua = filtre.jusqua))
  if (filtre.clientId) (conditions.push('v.client_id = :clientId'), (params.clientId = filtre.clientId))
  if (filtre.utilisateurId) (conditions.push('v.utilisateur_id = :utilisateurId'), (params.utilisateurId = filtre.utilisateurId))
  if (filtre.statut) (conditions.push('v.statut = :statut'), (params.statut = filtre.statut))
  if (filtre.recherche) {
    conditions.push('(v.reference LIKE :recherche OR c.nom LIKE :recherche)')
    params.recherche = `%${filtre.recherche}%`
  }

  return base()
    .prepare(
      `SELECT v.*, c.nom AS client_nom, u.nom_complet AS utilisateur,
              (SELECT COALESCE(SUM(quantite), 0) FROM vente_lignes WHERE vente_id = v.id) AS nb_articles
       FROM ventes v
       LEFT JOIN clients c ON c.id = v.client_id
       JOIN utilisateurs u ON u.id = v.utilisateur_id
       ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
       ORDER BY v.at DESC, v.id DESC
       LIMIT :limite`
    )
    .all(params) as Vente[]
}

export function detailVente(venteId: number): VenteDetail | null {
  const vente = base()
    .prepare(
      `SELECT v.*, c.nom AS client_nom, u.nom_complet AS utilisateur
       FROM ventes v
       LEFT JOIN clients c ON c.id = v.client_id
       JOIN utilisateurs u ON u.id = v.utilisateur_id
       WHERE v.id = ?`
    )
    .get(venteId) as Vente | undefined

  if (!vente) return null

  const lignes = base()
    .prepare(
      `SELECT vl.*, l.numero AS numero_lot
       FROM vente_lignes vl LEFT JOIN lots l ON l.id = vl.lot_id
       WHERE vl.vente_id = ? ORDER BY vl.id`
    )
    .all(venteId) as VenteLigne[]

  const paiements = base()
    .prepare('SELECT mode, montant, reference FROM vente_paiements WHERE vente_id = ? ORDER BY id')
    .all(venteId) as VenteDetail['paiements']

  return { ...vente, lignes, paiements }
}
