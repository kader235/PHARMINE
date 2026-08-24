import type { SQLInputValue } from 'node:sqlite'
import { base, transaction } from '../db'
import type { Inventaire, InventaireLigne } from '@shared/types'
import { ErreurMetier, journaliser, maintenant, prochaineReference } from './commun'
import { ajusterLot } from './stock'
import { rafraichirAlertes } from './alertes'

export interface DemandeInventaire {
  libelle: string
  perimetre: 'total' | 'categorie' | 'emplacement' | 'selection'
  perimetreRef?: string | null
  produitIds?: number[]
}

/**
 * Ouvre une session d'inventaire. Le stock théorique est figé lot par lot au
 * moment de l'ouverture : c'est ce qui permet de comparer honnêtement au
 * comptage physique, même si des ventes ont lieu pendant le comptage.
 */
export function ouvrirInventaire(demande: DemandeInventaire, utilisateurId: number): Inventaire {
  if (!demande.libelle?.trim()) throw new ErreurMetier('Donnez un nom à cet inventaire.', 'libelle')

  const enCours = base().prepare("SELECT reference FROM inventaires WHERE statut = 'en_cours'").get() as unknown as
    | { reference: string }
    | undefined
  if (enCours) {
    throw new ErreurMetier(
      `L’inventaire ${enCours.reference} est déjà en cours. Validez-le ou annulez-le avant d’en ouvrir un autre.`,
      'inventaire_en_cours'
    )
  }

  return transaction(() => {
    const reference = prochaineReference('INV', 'inventaires')
    const resultat = base()
      .prepare(
        `INSERT INTO inventaires (reference, libelle, perimetre, perimetre_ref, ouvert_par)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(reference, demande.libelle.trim(), demande.perimetre, demande.perimetreRef ?? null, utilisateurId)

    const inventaireId = Number(resultat.lastInsertRowid)

    const conditions = ['p.archived_at IS NULL', 'l.quantite_restante > 0']
    const params: Record<string, SQLInputValue> = { inv: inventaireId }

    if (demande.perimetre === 'categorie' && demande.perimetreRef) {
      conditions.push('p.categorie_id = :ref')
      params.ref = Number(demande.perimetreRef)
    } else if (demande.perimetre === 'emplacement' && demande.perimetreRef) {
      conditions.push('p.emplacement = :ref')
      params.ref = demande.perimetreRef
    } else if (demande.perimetre === 'selection') {
      if (!demande.produitIds?.length) throw new ErreurMetier('Sélectionnez au moins un produit.')
      conditions.push(`p.id IN (${demande.produitIds.map(Number).join(',')})`)
    }

    base()
      .prepare(
        `INSERT INTO inventaire_lignes (inventaire_id, produit_id, lot_id, stock_theorique)
         SELECT :inv, p.id, l.id, l.quantite_restante
         FROM produits p JOIN lots l ON l.produit_id = p.id
         WHERE ${conditions.join(' AND ')}`
      )
      .run(params)

    const nb = (
      base().prepare('SELECT COUNT(*) n FROM inventaire_lignes WHERE inventaire_id = ?').get(inventaireId) as unknown as {
        n: number
      }
    ).n

    if (nb === 0) {
      throw new ErreurMetier(
        'Aucun lot en stock ne correspond à ce périmètre. Il n’y a rien à compter.',
        'perimetre_vide'
      )
    }

    journaliser({
      utilisateurId,
      action: 'Inventaire ouvert',
      entite: 'inventaire',
      entiteId: inventaireId,
      resume: `${reference} — ${demande.libelle}, ${nb} lot(s) à compter`
    })

    return inventaire(inventaireId)!
  })
}

export function saisirComptage(
  ligneId: number,
  stockCompte: number,
  justification: string | null,
  utilisateurId: number
): void {
  if (stockCompte < 0) throw new ErreurMetier('Une quantité comptée ne peut pas être négative.')

  const ligne = base()
    .prepare(
      `SELECT il.*, i.statut FROM inventaire_lignes il
       JOIN inventaires i ON i.id = il.inventaire_id WHERE il.id = ?`
    )
    .get(ligneId) as unknown as (InventaireLigne & { statut: string; inventaire_id: number }) | undefined

  if (!ligne) throw new ErreurMetier('Ligne d’inventaire introuvable.')
  if (ligne.statut !== 'en_cours') throw new ErreurMetier('Cet inventaire est clos.')

  base()
    .prepare(
      `UPDATE inventaire_lignes
       SET stock_compte = ?, ecart = ? - stock_theorique, justification = ?, compte_at = ?, compte_par = ?
       WHERE id = ?`
    )
    .run(stockCompte, stockCompte, justification, maintenant(), utilisateurId, ligneId)
}

export interface ResultatValidation {
  lignesAjustees: number
  ecartValeur: number
  ecartUnites: number
}

/**
 * Valide l'inventaire : chaque écart devient un mouvement de stock tracé.
 * Les lignes non comptées sont ignorées — on n'invente pas un comptage.
 */
export function validerInventaire(inventaireId: number, utilisateurId: number): ResultatValidation {
  const inv = base().prepare('SELECT * FROM inventaires WHERE id = ?').get(inventaireId) as unknown as Inventaire | undefined
  if (!inv) throw new ErreurMetier('Inventaire introuvable.')
  if (inv.statut !== 'en_cours') throw new ErreurMetier('Cet inventaire est déjà clos.')

  const nonComptees = (
    base()
      .prepare('SELECT COUNT(*) n FROM inventaire_lignes WHERE inventaire_id = ? AND stock_compte IS NULL')
      .get(inventaireId) as unknown as { n: number }
  ).n

  const comptees = (
    base()
      .prepare('SELECT COUNT(*) n FROM inventaire_lignes WHERE inventaire_id = ? AND stock_compte IS NOT NULL')
      .get(inventaireId) as unknown as { n: number }
  ).n

  if (comptees === 0) throw new ErreurMetier('Aucune ligne n’a été comptée.', 'aucun_comptage')

  return transaction(() => {
    const ecarts = base()
      .prepare(
        `SELECT il.id, il.lot_id, il.ecart, il.stock_compte, il.justification,
                l.prix_achat, p.nom_commercial
         FROM inventaire_lignes il
         JOIN lots l ON l.id = il.lot_id
         JOIN produits p ON p.id = il.produit_id
         WHERE il.inventaire_id = ? AND il.stock_compte IS NOT NULL AND il.ecart <> 0`
      )
      .all(inventaireId) as unknown as {
      id: number
      lot_id: number
      ecart: number
      stock_compte: number
      justification: string | null
      prix_achat: number
      nom_commercial: string
    }[]

    let ecartValeur = 0
    let ecartUnites = 0

    for (const e of ecarts) {
      ajusterLot(
        e.lot_id,
        e.stock_compte,
        e.justification?.trim() || `Écart constaté à l’inventaire ${inv.reference}`,
        utilisateurId,
        'inventaire'
      )
      ecartValeur += e.ecart * e.prix_achat
      ecartUnites += e.ecart
    }

    base()
      .prepare(
        `UPDATE inventaires SET statut = 'valide', valide_at = ?, valide_par = ?, ecart_valeur = ? WHERE id = ?`
      )
      .run(maintenant(), utilisateurId, ecartValeur, inventaireId)

    journaliser({
      utilisateurId,
      action: 'Inventaire validé',
      entite: 'inventaire',
      entiteId: inventaireId,
      resume: `${inv.reference} — ${ecarts.length} écart(s) ajusté(s), valeur ${ecartValeur}${nonComptees ? `, ${nonComptees} ligne(s) non comptée(s)` : ''}`,
      details: { ecartValeur, ecartUnites, nonComptees }
    })

    rafraichirAlertes()

    return { lignesAjustees: ecarts.length, ecartValeur, ecartUnites }
  })
}

export function annulerInventaire(inventaireId: number, motif: string, utilisateurId: number): void {
  if (!motif?.trim()) throw new ErreurMetier('Un motif est obligatoire.')
  transaction(() => {
    base()
      .prepare("UPDATE inventaires SET statut = 'annule', note = ? WHERE id = ? AND statut = 'en_cours'")
      .run(motif, inventaireId)
    journaliser({
      utilisateurId,
      action: 'Inventaire annulé',
      entite: 'inventaire',
      entiteId: inventaireId,
      resume: motif
    })
  })
}

export function listerInventaires(limite = 50): Inventaire[] {
  return base()
    .prepare(
      `SELECT i.*, u.nom_complet AS ouvert_par_nom,
              (SELECT COUNT(*) FROM inventaire_lignes WHERE inventaire_id = i.id) nb_lignes,
              (SELECT COUNT(*) FROM inventaire_lignes WHERE inventaire_id = i.id AND stock_compte IS NOT NULL) nb_comptees
       FROM inventaires i JOIN utilisateurs u ON u.id = i.ouvert_par
       ORDER BY i.ouvert_at DESC LIMIT ?`
    )
    .all(limite) as unknown as Inventaire[]
}

export function inventaire(id: number): (Inventaire & { lignes: InventaireLigne[] }) | null {
  const inv = base()
    .prepare(
      `SELECT i.*, u.nom_complet AS ouvert_par_nom,
              (SELECT COUNT(*) FROM inventaire_lignes WHERE inventaire_id = i.id) nb_lignes,
              (SELECT COUNT(*) FROM inventaire_lignes WHERE inventaire_id = i.id AND stock_compte IS NOT NULL) nb_comptees
       FROM inventaires i JOIN utilisateurs u ON u.id = i.ouvert_par WHERE i.id = ?`
    )
    .get(id) as unknown as Inventaire | undefined
  if (!inv) return null

  const lignes = base()
    .prepare(
      `SELECT il.id, il.produit_id, p.nom_commercial, p.dosage, p.emplacement,
              il.lot_id, l.numero AS numero_lot, l.date_peremption, l.prix_achat,
              il.stock_theorique, il.stock_compte, il.ecart, il.justification
       FROM inventaire_lignes il
       JOIN produits p ON p.id = il.produit_id
       LEFT JOIN lots l ON l.id = il.lot_id
       WHERE il.inventaire_id = ?
       ORDER BY p.emplacement, p.nom_commercial, l.date_peremption`
    )
    .all(id) as unknown as InventaireLigne[]

  return { ...inv, lignes }
}

export function inventaireEnCours(): Inventaire | null {
  const l = base().prepare("SELECT id FROM inventaires WHERE statut = 'en_cours'").get() as unknown as
    | { id: number }
    | undefined
  return l ? inventaire(l.id) : null
}
