import type { SQLInputValue } from 'node:sqlite'
import { base, transaction } from '../db'
import type { Page, Produit, ProduitEtat } from '@shared/types'
import { ErreurMetier, journaliser, maintenant, prochaineReference } from './commun'

/** Prépare une saisie libre pour FTS5 : préfixe chaque terme, échappe les guillemets. */
function requeteFts(saisie: string): string | null {
  const termes = saisie
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => `"${t.replace(/"/g, '""')}"*`)
  return termes.length ? termes.join(' ') : null
}

export interface FiltreProduits {
  recherche?: string
  categorieId?: number
  etat?: 'rupture' | 'faible' | 'disponible' | 'surstock'
  ordonnance?: boolean
  inclureArchives?: boolean
  tri?: 'nom' | 'stock' | 'prix' | 'valeur'
  sens?: 'asc' | 'desc'
  page?: number
  parPage?: number
}

export function listerProduits(filtre: FiltreProduits = {}): Page<ProduitEtat> {
  const conditions: string[] = []
  const params: Record<string, SQLInputValue> = {}

  if (!filtre.inclureArchives) conditions.push('p.archived_at IS NULL')
  if (filtre.categorieId) (conditions.push('p.categorie_id = :categorieId'), (params.categorieId = filtre.categorieId))
  if (filtre.etat) (conditions.push('p.etat_stock = :etat'), (params.etat = filtre.etat))
  if (filtre.ordonnance !== undefined) conditions.push(`p.ordonnance_requise = ${filtre.ordonnance ? 1 : 0}`)

  if (filtre.recherche?.trim()) {
    const saisie = filtre.recherche.trim()
    const fts = requeteFts(saisie)
    // Le code-barres est recherché à l'identique : un scan doit toujours aboutir.
    if (fts) {
      conditions.push(
        `(p.id IN (SELECT rowid FROM produits_fts WHERE produits_fts MATCH :fts)
          OR p.id IN (SELECT produit_id FROM produit_codes_barres WHERE code = :exact)
          OR p.code_interne = :exact)`
      )
      params.fts = fts
      params.exact = saisie
    } else {
      conditions.push(
        `(p.nom_commercial LIKE :flou OR p.code_interne = :exact
          OR p.id IN (SELECT produit_id FROM produit_codes_barres WHERE code = :exact))`
      )
      params.flou = `%${saisie}%`
      params.exact = saisie
    }
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
  const colonnes = { nom: 'p.nom_commercial', stock: 'p.stock_disponible', prix: 'p.prix_vente', valeur: 'p.valeur_achat' }
  const tri = colonnes[filtre.tri ?? 'nom']
  const sens = filtre.sens === 'desc' ? 'DESC' : 'ASC'

  const parPage = Math.min(filtre.parPage ?? 50, 500)
  const page = Math.max(filtre.page ?? 1, 1)

  // Deux jeux de paramètres distincts : node:sqlite refuse un paramètre nommé
  // qui n'apparaît pas dans la requête, et le comptage ignore la pagination.
  const total = (
    base().prepare(`SELECT COUNT(*) n FROM v_produit_etat p ${where}`).get(params) as unknown as { n: number }
  ).n

  const lignes = base()
    .prepare(
      `SELECT p.* FROM v_produit_etat p ${where}
       ORDER BY ${tri} ${sens}, p.nom_commercial
       LIMIT :limite OFFSET :decalage`
    )
    .all({ ...params, limite: parPage, decalage: (page - 1) * parPage }) as unknown as ProduitEtat[]

  return { lignes, total, page, parPage }
}

/** Recherche du comptoir : rapide, tolérante aux accents, code-barres prioritaire. */
export function rechercheRapide(saisie: string, limite = 20): ProduitEtat[] {
  const terme = saisie.trim()
  if (!terme) return []

  const parCode = base()
    .prepare(
      `SELECT p.* FROM v_produit_etat p
       WHERE p.archived_at IS NULL AND p.vente_autorisee = 1
         AND (p.code_interne = ? OR p.id IN (SELECT produit_id FROM produit_codes_barres WHERE code = ?))`
    )
    .all(terme, terme) as unknown as ProduitEtat[]

  if (parCode.length) return parCode

  const fts = requeteFts(terme)
  if (!fts) {
    return base()
      .prepare(
        `SELECT p.* FROM v_produit_etat p
         WHERE p.archived_at IS NULL AND p.vente_autorisee = 1 AND p.nom_commercial LIKE ?
         ORDER BY p.nom_commercial LIMIT ?`
      )
      .all(`%${terme}%`, limite) as unknown as ProduitEtat[]
  }

  // Classement : le stock disponible d'abord, pour que le comptoir propose
  // en tête ce qui peut réellement être vendu.
  return base()
    .prepare(
      `SELECT p.* FROM produits_fts f
       JOIN v_produit_etat p ON p.id = f.rowid
       WHERE produits_fts MATCH ? AND p.archived_at IS NULL AND p.vente_autorisee = 1
       ORDER BY (p.stock_disponible > 0) DESC, rank, p.nom_commercial
       LIMIT ?`
    )
    .all(fts, limite) as unknown as ProduitEtat[]
}

export function produit(id: number): ProduitEtat | null {
  const p = base().prepare('SELECT * FROM v_produit_etat WHERE id = ?').get(id) as unknown as ProduitEtat | undefined
  if (!p) return null
  p.codes_barres = (
    base().prepare('SELECT code FROM produit_codes_barres WHERE produit_id = ? ORDER BY principal DESC').all(id) as unknown as {
      code: string
    }[]
  ).map((c) => c.code)
  return p
}

export interface DemandeProduit {
  nomCommercial: string
  nomGenerique?: string | null
  principeActif?: string | null
  dosage?: string | null
  categorieId?: number | null
  laboratoireId?: number | null
  formeId?: number | null
  uniteId?: number | null
  prixAchat: number
  prixVente: number
  tauxTva?: number
  stockMin: number
  stockMax?: number | null
  emplacement?: string | null
  ordonnanceRequise?: boolean
  suiviPeremption?: boolean
  venteAutorisee?: boolean
  notes?: string | null
  codesBarres?: string[]
  codeInterne?: string
}

function valider(demande: DemandeProduit): void {
  if (!demande.nomCommercial?.trim()) throw new ErreurMetier('Le nom commercial est obligatoire.', 'nomCommercial')
  if (demande.prixVente < 0 || demande.prixAchat < 0) throw new ErreurMetier('Un prix ne peut pas être négatif.', 'prix')
  if (demande.stockMin < 0) throw new ErreurMetier('Le seuil minimum ne peut pas être négatif.', 'stockMin')
  if (demande.stockMax != null && demande.stockMax < demande.stockMin) {
    throw new ErreurMetier('Le stock maximum doit être supérieur au seuil minimum.', 'stockMax')
  }
}

export function creerProduit(demande: DemandeProduit, utilisateurId: number): number {
  valider(demande)

  return transaction(() => {
    const code = demande.codeInterne?.trim() || prochaineReference('P', 'produits', 'code_interne')

    if (base().prepare('SELECT 1 x FROM produits WHERE code_interne = ?').get(code)) {
      throw new ErreurMetier('Ce code produit est déjà utilisé.', 'codeInterne')
    }

    const resultat = base()
      .prepare(
        `INSERT INTO produits
           (code_interne, nom_commercial, nom_generique, principe_actif, dosage,
            categorie_id, laboratoire_id, forme_id, unite_id, prix_achat, prix_vente,
            taux_tva, stock_min, stock_max, emplacement, ordonnance_requise,
            suivi_peremption, vente_autorisee, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        code,
        demande.nomCommercial.trim(),
        demande.nomGenerique ?? null,
        demande.principeActif ?? null,
        demande.dosage ?? null,
        demande.categorieId ?? null,
        demande.laboratoireId ?? null,
        demande.formeId ?? null,
        demande.uniteId ?? null,
        demande.prixAchat,
        demande.prixVente,
        demande.tauxTva ?? 0,
        demande.stockMin,
        demande.stockMax ?? null,
        demande.emplacement ?? null,
        demande.ordonnanceRequise ? 1 : 0,
        demande.suiviPeremption === false ? 0 : 1,
        demande.venteAutorisee === false ? 0 : 1,
        demande.notes ?? null,
        utilisateurId
      )

    const id = Number(resultat.lastInsertRowid)
    ecrireCodesBarres(id, demande.codesBarres ?? [])

    journaliser({
      utilisateurId,
      action: 'Produit créé',
      entite: 'produit',
      entiteId: id,
      resume: `${demande.nomCommercial} (${code})`
    })

    return id
  })
}

function ecrireCodesBarres(produitId: number, codes: string[]): void {
  base().prepare('DELETE FROM produit_codes_barres WHERE produit_id = ?').run(produitId)
  codes
    .map((c) => c.trim())
    .filter(Boolean)
    .forEach((code, index) => {
      const proprietaire = base()
        .prepare('SELECT produit_id FROM produit_codes_barres WHERE code = ?')
        .get(code) as unknown as { produit_id: number } | undefined
      if (proprietaire && proprietaire.produit_id !== produitId) {
        throw new ErreurMetier(`Le code-barres ${code} est déjà attribué à un autre produit.`, 'codesBarres')
      }
      base()
        .prepare('INSERT OR REPLACE INTO produit_codes_barres (code, produit_id, principal) VALUES (?, ?, ?)')
        .run(code, produitId, index === 0 ? 1 : 0)
    })
}

export function modifierProduit(id: number, demande: DemandeProduit, utilisateurId: number): void {
  valider(demande)

  const avant = base().prepare('SELECT * FROM produits WHERE id = ?').get(id) as unknown as Produit | undefined
  if (!avant) throw new ErreurMetier('Produit introuvable.')

  transaction(() => {
    base()
      .prepare(
        `UPDATE produits SET
           nom_commercial = ?, nom_generique = ?, principe_actif = ?, dosage = ?,
           categorie_id = ?, laboratoire_id = ?, forme_id = ?, unite_id = ?,
           prix_achat = ?, prix_vente = ?, taux_tva = ?, stock_min = ?, stock_max = ?,
           emplacement = ?, ordonnance_requise = ?, suivi_peremption = ?,
           vente_autorisee = ?, notes = ?, updated_at = ?, updated_by = ?
         WHERE id = ?`
      )
      .run(
        demande.nomCommercial.trim(),
        demande.nomGenerique ?? null,
        demande.principeActif ?? null,
        demande.dosage ?? null,
        demande.categorieId ?? null,
        demande.laboratoireId ?? null,
        demande.formeId ?? null,
        demande.uniteId ?? null,
        demande.prixAchat,
        demande.prixVente,
        demande.tauxTva ?? 0,
        demande.stockMin,
        demande.stockMax ?? null,
        demande.emplacement ?? null,
        demande.ordonnanceRequise ? 1 : 0,
        demande.suiviPeremption === false ? 0 : 1,
        demande.venteAutorisee === false ? 0 : 1,
        demande.notes ?? null,
        maintenant(),
        utilisateurId,
        id
      )

    if (demande.codesBarres) ecrireCodesBarres(id, demande.codesBarres)

    // Un changement de prix est tracé séparément : c'est l'information que
    // l'on cherche en priorité dans un journal d'activité.
    if (avant.prix_vente !== demande.prixVente) {
      journaliser({
        utilisateurId,
        action: 'Prix modifié',
        entite: 'produit',
        entiteId: id,
        resume: `${demande.nomCommercial} : ${avant.prix_vente} → ${demande.prixVente}`,
        details: { avant: avant.prix_vente, apres: demande.prixVente }
      })
    }

    journaliser({
      utilisateurId,
      action: 'Produit modifié',
      entite: 'produit',
      entiteId: id,
      resume: demande.nomCommercial
    })
  })
}

export function archiverProduit(id: number, archiver: boolean, utilisateurId: number): void {
  const p = base().prepare('SELECT nom_commercial FROM produits WHERE id = ?').get(id) as unknown as
    | { nom_commercial: string }
    | undefined
  if (!p) throw new ErreurMetier('Produit introuvable.')

  if (archiver) {
    const stock = (
      base().prepare('SELECT stock_disponible s FROM v_stock_produit WHERE produit_id = ?').get(id) as unknown as
    | { s: number }
        | undefined
    )?.s ?? 0
    if (stock > 0) {
      throw new ErreurMetier(
        `${p.nom_commercial} détient encore ${stock} unité(s) en stock. Écoulez ou sortez le stock avant d’archiver.`,
        'stock_restant'
      )
    }
  }

  transaction(() => {
    base().prepare('UPDATE produits SET archived_at = ? WHERE id = ?').run(archiver ? maintenant() : null, id)
    journaliser({
      utilisateurId,
      action: archiver ? 'Produit archivé' : 'Produit restauré',
      entite: 'produit',
      entiteId: id,
      resume: p.nom_commercial
    })
  })
}

export function referentiels(): {
  categories: { id: number; nom: string }[]
  formes: { id: number; nom: string; abbreviation: string | null }[]
  unites: { id: number; nom: string; abbreviation: string }[]
  laboratoires: { id: number; nom: string }[]
} {
  const db = base()
  return {
    categories: db.prepare('SELECT id, nom FROM categories WHERE archived_at IS NULL ORDER BY ordre, nom').all() as unknown as never,
    formes: db.prepare('SELECT id, nom, abbreviation FROM formes ORDER BY ordre, nom').all() as unknown as never,
    unites: db.prepare('SELECT id, nom, abbreviation FROM unites ORDER BY ordre, nom').all() as unknown as never,
    laboratoires: db.prepare('SELECT id, nom FROM laboratoires WHERE archived_at IS NULL ORDER BY nom').all() as unknown as never
  }
}

export function creerLaboratoire(nom: string): number {
  const existe = base().prepare('SELECT id FROM laboratoires WHERE nom = ? COLLATE NOCASE').get(nom.trim()) as unknown as
    | { id: number }
    | undefined
  if (existe) return existe.id
  return Number(base().prepare('INSERT INTO laboratoires (nom) VALUES (?)').run(nom.trim()).lastInsertRowid)
}

/** Historique complet d'un produit : mouvements, ventes, statistiques. */
export function statistiquesProduit(id: number): {
  ventes30j: number
  quantite30j: number
  ventes12m: { mois: string; quantite: number; montant: number }[]
  margeUnitaire: number
  tauxMarge: number
} {
  const db = base()
  const p = db.prepare('SELECT prix_achat, prix_vente FROM produits WHERE id = ?').get(id) as unknown as
    | { prix_achat: number; prix_vente: number }
    | undefined

  const recent = db
    .prepare(
      `SELECT COUNT(DISTINCT v.id) n, COALESCE(SUM(vl.quantite), 0) q
       FROM vente_lignes vl JOIN ventes v ON v.id = vl.vente_id
       WHERE vl.produit_id = ? AND v.statut = 'finalisee' AND v.at >= datetime('now', '-30 day')`
    )
    .get(id) as unknown as { n: number; q: number }

  const parMois = db
    .prepare(
      `SELECT substr(v.at, 1, 7) mois, SUM(vl.quantite) quantite, SUM(vl.montant) montant
       FROM vente_lignes vl JOIN ventes v ON v.id = vl.vente_id
       WHERE vl.produit_id = ? AND v.statut = 'finalisee' AND v.at >= datetime('now', '-12 month')
       GROUP BY mois ORDER BY mois`
    )
    .all(id) as unknown as { mois: string; quantite: number; montant: number }[]

  const marge = (p?.prix_vente ?? 0) - (p?.prix_achat ?? 0)
  return {
    ventes30j: recent.n,
    quantite30j: recent.q,
    ventes12m: parMois,
    margeUnitaire: marge,
    tauxMarge: p?.prix_vente ? Math.round((marge / p.prix_vente) * 1000) / 10 : 0
  }
}
