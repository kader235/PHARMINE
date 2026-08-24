import { base, transaction } from '../db'
import type { Depense } from '@shared/types'
import { ErreurMetier, aujourdhui, journaliser, prochaineReference } from './commun'
import { sessionOuverte } from './caisse'

export interface DemandeDepense {
  date: string
  categorieId: number
  libelle: string
  montant: number
  mode?: 'especes' | 'mobile_money' | 'carte' | 'virement' | 'cheque'
  beneficiaire?: string | null
  surCaisse?: boolean
  note?: string | null
}

export function enregistrerDepense(demande: DemandeDepense, utilisateurId: number): number {
  if (!demande.libelle?.trim()) throw new ErreurMetier('Le libellé est obligatoire.', 'libelle')
  if (demande.montant <= 0) throw new ErreurMetier('Le montant doit être supérieur à zéro.', 'montant')
  if (demande.date > aujourdhui()) throw new ErreurMetier('Une dépense ne peut pas être datée du futur.', 'date')

  const surCaisse = demande.surCaisse !== false && (demande.mode ?? 'especes') === 'especes'
  const session = sessionOuverte()

  if (surCaisse && !session) {
    throw new ErreurMetier(
      'Aucune caisse ouverte : impossible d’imputer cette dépense sur la caisse.',
      'caisse_fermee'
    )
  }

  return transaction(() => {
    const reference = prochaineReference('D', 'depenses')
    const resultat = base()
      .prepare(
        `INSERT INTO depenses
           (reference, date, categorie_id, libelle, montant, mode, beneficiaire, sur_caisse, note, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        reference,
        demande.date,
        demande.categorieId,
        demande.libelle.trim(),
        demande.montant,
        demande.mode ?? 'especes',
        demande.beneficiaire ?? null,
        surCaisse ? 1 : 0,
        demande.note ?? null,
        utilisateurId
      )

    const id = Number(resultat.lastInsertRowid)

    if (surCaisse && session) {
      base()
        .prepare(
          `INSERT INTO caisse_mouvements
             (session_id, type, montant, mode, motif, reference_type, reference_id, utilisateur_id)
           VALUES (?, 'depense', ?, 'especes', ?, 'depense', ?, ?)`
        )
        .run(session.id, -demande.montant, demande.libelle.trim(), id, utilisateurId)
    }

    journaliser({
      utilisateurId,
      action: 'Dépense enregistrée',
      entite: 'depense',
      entiteId: id,
      resume: `${reference} — ${demande.libelle} : ${demande.montant}`
    })

    return id
  })
}

export interface FiltreDepenses {
  depuis?: string
  jusqua?: string
  categorieId?: number
  limite?: number
}

export function listerDepenses(filtre: FiltreDepenses = {}): Depense[] {
  const conditions = ['d.archived_at IS NULL']
  const params: Record<string, unknown> = { limite: filtre.limite ?? 200 }

  if (filtre.depuis) (conditions.push('d.date >= :depuis'), (params.depuis = filtre.depuis))
  if (filtre.jusqua) (conditions.push('d.date <= :jusqua'), (params.jusqua = filtre.jusqua))
  if (filtre.categorieId) (conditions.push('d.categorie_id = :categorieId'), (params.categorieId = filtre.categorieId))

  return base()
    .prepare(
      `SELECT d.*, c.nom AS categorie, u.nom_complet AS utilisateur
       FROM depenses d
       JOIN depense_categories c ON c.id = d.categorie_id
       JOIN utilisateurs u ON u.id = d.created_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY d.date DESC, d.id DESC LIMIT :limite`
    )
    .all(params) as Depense[]
}

export function categoriesDepenses(): { id: number; nom: string }[] {
  return base()
    .prepare('SELECT id, nom FROM depense_categories WHERE archived_at IS NULL ORDER BY ordre, nom')
    .all() as { id: number; nom: string }[]
}

export function archiverDepense(id: number, utilisateurId: number): void {
  transaction(() => {
    const d = base().prepare('SELECT reference, libelle FROM depenses WHERE id = ?').get(id) as
      | { reference: string; libelle: string }
      | undefined
    if (!d) throw new ErreurMetier('Dépense introuvable.')

    base()
      .prepare("UPDATE depenses SET archived_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
      .run(id)

    journaliser({
      utilisateurId,
      action: 'Dépense archivée',
      entite: 'depense',
      entiteId: id,
      resume: `${d.reference} — ${d.libelle}`
    })
  })
}

export interface SyntheseFinanciere {
  periode: { depuis: string; jusqua: string }
  chiffreAffaires: number
  coutMarchandises: number
  margeBrute: number
  depenses: number
  achats: number
  resultat: number
  nbVentes: number
  panierMoyen: number
  dettesFournisseurs: number
  creancesClients: number
  valeurStock: number
  parCategorieDepense: { categorie: string; montant: number }[]
  parModePaiement: { mode: string; montant: number; nb: number }[]
}

export function synthese(depuis: string, jusqua: string): SyntheseFinanciere {
  const db = base()
  const bornes = { d: depuis + 'T00:00:00.000Z', f: jusqua + 'T23:59:59.999Z' }

  const ventes = db
    .prepare(
      `SELECT COUNT(*) n, COALESCE(SUM(total), 0) ca, COALESCE(SUM(cout_total), 0) cout
       FROM ventes WHERE statut = 'finalisee' AND at BETWEEN ? AND ?`
    )
    .get(bornes.d, bornes.f) as { n: number; ca: number; cout: number }

  const depenses = (
    db
      .prepare(
        `SELECT COALESCE(SUM(montant), 0) s FROM depenses
         WHERE archived_at IS NULL AND date BETWEEN ? AND ?`
      )
      .get(depuis, jusqua) as { s: number }
  ).s

  const achats = (
    db
      .prepare(
        `SELECT COALESCE(SUM(total), 0) s FROM achats
         WHERE statut IN ('recu','recu_partiel') AND date_reception BETWEEN ? AND ?`
      )
      .get(depuis, jusqua) as { s: number }
  ).s

  const dettes = (
    db.prepare('SELECT COALESCE(SUM(solde_du), 0) s FROM v_dette_fournisseur').get() as { s: number }
  ).s
  const creances = (
    db.prepare('SELECT COALESCE(SUM(solde_du), 0) s FROM v_creance_client WHERE solde_du > 0').get() as { s: number }
  ).s
  const stock = (
    db.prepare('SELECT COALESCE(SUM(valeur_achat), 0) s FROM v_stock_produit').get() as { s: number }
  ).s

  const parCategorie = db
    .prepare(
      `SELECT c.nom AS categorie, SUM(d.montant) montant
       FROM depenses d JOIN depense_categories c ON c.id = d.categorie_id
       WHERE d.archived_at IS NULL AND d.date BETWEEN ? AND ?
       GROUP BY c.id ORDER BY montant DESC`
    )
    .all(depuis, jusqua) as { categorie: string; montant: number }[]

  const parMode = db
    .prepare(
      `SELECT vp.mode, SUM(vp.montant) montant, COUNT(*) nb
       FROM vente_paiements vp JOIN ventes v ON v.id = vp.vente_id
       WHERE v.statut = 'finalisee' AND v.at BETWEEN ? AND ?
       GROUP BY vp.mode ORDER BY montant DESC`
    )
    .all(bornes.d, bornes.f) as { mode: string; montant: number; nb: number }[]

  const margeBrute = ventes.ca - ventes.cout

  return {
    periode: { depuis, jusqua },
    chiffreAffaires: ventes.ca,
    coutMarchandises: ventes.cout,
    margeBrute,
    depenses,
    achats,
    resultat: margeBrute - depenses,
    nbVentes: ventes.n,
    panierMoyen: ventes.n ? Math.round(ventes.ca / ventes.n) : 0,
    dettesFournisseurs: dettes,
    creancesClients: creances,
    valeurStock: stock,
    parCategorieDepense: parCategorie,
    parModePaiement: parMode
  }
}
