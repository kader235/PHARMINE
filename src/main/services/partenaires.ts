import type { SQLInputValue } from 'node:sqlite'
import { base, transaction } from '../db'
import type { ApercuCompte, Client, Fournisseur, LigneReleve } from '@shared/types'
import { ErreurMetier, debutDeJournee, journaliser, maintenant, prochaineReference } from './commun'

// ---------------------------------------------------------------------------
// Fournisseurs
// ---------------------------------------------------------------------------

export function listerFournisseurs(recherche?: string, inclureArchives = false): Fournisseur[] {
  const conditions: string[] = []
  const params: Record<string, SQLInputValue> = {}
  if (!inclureArchives) conditions.push('f.archived_at IS NULL')
  if (recherche?.trim()) {
    conditions.push('(f.nom LIKE :q OR f.telephone LIKE :q OR f.contact_principal LIKE :q)')
    params.q = `%${recherche.trim()}%`
  }

  return base()
    .prepare(
      `SELECT f.*, d.total_achats, d.total_paye, d.solde_du, d.dernier_achat
       FROM fournisseurs f
       LEFT JOIN v_dette_fournisseur d ON d.fournisseur_id = f.id
       ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
       ORDER BY f.nom`
    )
    .all(params) as unknown as Fournisseur[]
}

export function fournisseur(id: number): (Fournisseur & { produits: { id: number; nom: string; dernier_prix: number }[] }) | null {
  const f = base()
    .prepare(
      `SELECT f.*, d.total_achats, d.total_paye, d.solde_du, d.dernier_achat
       FROM fournisseurs f LEFT JOIN v_dette_fournisseur d ON d.fournisseur_id = f.id
       WHERE f.id = ?`
    )
    .get(id) as unknown as Fournisseur | undefined
  if (!f) return null

  const produits = base()
    .prepare(
      `SELECT p.id, p.nom_commercial AS nom, MAX(l.prix_achat) dernier_prix
       FROM lots l JOIN produits p ON p.id = l.produit_id
       WHERE l.fournisseur_id = ? GROUP BY p.id ORDER BY p.nom_commercial LIMIT 50`
    )
    .all(id) as unknown as { id: number; nom: string; dernier_prix: number }[]

  return { ...f, produits }
}

export interface DemandeFournisseur {
  nom: string
  contactPrincipal?: string | null
  telephone?: string | null
  email?: string | null
  adresse?: string | null
  ville?: string | null
  pays?: string | null
  conditionsPaiement?: string | null
  delaiLivraisonJours?: number | null
  notes?: string | null
}

export function enregistrerFournisseur(
  id: number | null,
  demande: DemandeFournisseur,
  utilisateurId: number
): number {
  if (!demande.nom?.trim()) throw new ErreurMetier('Le nom du fournisseur est obligatoire.', 'nom')

  return transaction(() => {
    if (id) {
      base()
        .prepare(
          `UPDATE fournisseurs SET nom = ?, contact_principal = ?, telephone = ?, email = ?,
             adresse = ?, ville = ?, pays = ?, conditions_paiement = ?, delai_livraison_jours = ?, notes = ?
           WHERE id = ?`
        )
        .run(
          demande.nom.trim(),
          demande.contactPrincipal ?? null,
          demande.telephone ?? null,
          demande.email ?? null,
          demande.adresse ?? null,
          demande.ville ?? null,
          demande.pays ?? null,
          demande.conditionsPaiement ?? null,
          demande.delaiLivraisonJours ?? null,
          demande.notes ?? null,
          id
        )
      journaliser({ utilisateurId, action: 'Fournisseur modifié', entite: 'fournisseur', entiteId: id, resume: demande.nom })
      return id
    }

    const code = prochaineReference('F', 'fournisseurs', 'code')
    const resultat = base()
      .prepare(
        `INSERT INTO fournisseurs
           (code, nom, contact_principal, telephone, email, adresse, ville, pays,
            conditions_paiement, delai_livraison_jours, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        code,
        demande.nom.trim(),
        demande.contactPrincipal ?? null,
        demande.telephone ?? null,
        demande.email ?? null,
        demande.adresse ?? null,
        demande.ville ?? null,
        demande.pays ?? null,
        demande.conditionsPaiement ?? null,
        demande.delaiLivraisonJours ?? null,
        demande.notes ?? null,
        utilisateurId
      )

    const nouveau = Number(resultat.lastInsertRowid)
    journaliser({ utilisateurId, action: 'Fournisseur créé', entite: 'fournisseur', entiteId: nouveau, resume: `${demande.nom} (${code})` })
    return nouveau
  })
}

export function archiverFournisseur(id: number, archiver: boolean, utilisateurId: number): void {
  const solde = (
    base().prepare('SELECT solde_du s FROM v_dette_fournisseur WHERE fournisseur_id = ?').get(id) as unknown as
    | { s: number }
      | undefined
  )?.s ?? 0

  if (archiver && solde > 0) {
    throw new ErreurMetier(
      `Ce fournisseur a encore ${solde} de dette en cours. Soldez le compte avant d’archiver.`,
      'solde_restant'
    )
  }

  transaction(() => {
    base().prepare('UPDATE fournisseurs SET archived_at = ? WHERE id = ?').run(archiver ? maintenant() : null, id)
    journaliser({
      utilisateurId,
      action: archiver ? 'Fournisseur archivé' : 'Fournisseur restauré',
      entite: 'fournisseur',
      entiteId: id,
      resume: ''
    })
  })
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export function listerClients(recherche?: string, inclureArchives = false): Client[] {
  const conditions: string[] = []
  const params: Record<string, SQLInputValue> = {}
  if (!inclureArchives) conditions.push('c.archived_at IS NULL')
  if (recherche?.trim()) {
    conditions.push('(c.nom LIKE :q OR c.telephone LIKE :q OR c.code = :exact)')
    params.q = `%${recherche.trim()}%`
    params.exact = recherche.trim()
  }

  return base()
    .prepare(
      `SELECT c.*, v.total_achats, v.solde_du, v.derniere_visite
       FROM clients c LEFT JOIN v_creance_client v ON v.client_id = c.id
       ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
       ORDER BY c.nom`
    )
    .all(params) as unknown as Client[]
}

export function client(id: number): (Client & { ventes: { id: number; reference: string; at: string; total: number; reste_a_payer: number }[] }) | null {
  const c = base()
    .prepare(
      `SELECT c.*, v.total_achats, v.solde_du, v.derniere_visite
       FROM clients c LEFT JOIN v_creance_client v ON v.client_id = c.id WHERE c.id = ?`
    )
    .get(id) as unknown as Client | undefined
  if (!c) return null

  const ventes = base()
    .prepare(
      `SELECT id, reference, at, total, reste_a_payer FROM ventes
       WHERE client_id = ? ORDER BY at DESC LIMIT 50`
    )
    .all(id) as unknown as { id: number; reference: string; at: string; total: number; reste_a_payer: number }[]

  return { ...c, ventes }
}

export interface DemandeClient {
  nom: string
  telephone?: string | null
  email?: string | null
  adresse?: string | null
  dateNaissance?: string | null
  plafondCredit?: number
  notes?: string | null
}

export function enregistrerClient(id: number | null, demande: DemandeClient, utilisateurId: number): number {
  if (!demande.nom?.trim()) throw new ErreurMetier('Le nom du client est obligatoire.', 'nom')
  if ((demande.plafondCredit ?? 0) < 0) throw new ErreurMetier('Le plafond de crédit ne peut pas être négatif.', 'plafondCredit')

  return transaction(() => {
    if (id) {
      base()
        .prepare(
          `UPDATE clients SET nom = ?, telephone = ?, email = ?, adresse = ?,
             date_naissance = ?, plafond_credit = ?, notes = ? WHERE id = ?`
        )
        .run(
          demande.nom.trim(),
          demande.telephone ?? null,
          demande.email ?? null,
          demande.adresse ?? null,
          demande.dateNaissance ?? null,
          demande.plafondCredit ?? 0,
          demande.notes ?? null,
          id
        )
      journaliser({ utilisateurId, action: 'Client modifié', entite: 'client', entiteId: id, resume: demande.nom })
      return id
    }

    const code = prochaineReference('CL', 'clients', 'code')
    const resultat = base()
      .prepare(
        `INSERT INTO clients (code, nom, telephone, email, adresse, date_naissance, plafond_credit, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        code,
        demande.nom.trim(),
        demande.telephone ?? null,
        demande.email ?? null,
        demande.adresse ?? null,
        demande.dateNaissance ?? null,
        demande.plafondCredit ?? 0,
        demande.notes ?? null,
        utilisateurId
      )

    const nouveau = Number(resultat.lastInsertRowid)
    journaliser({ utilisateurId, action: 'Client créé', entite: 'client', entiteId: nouveau, resume: `${demande.nom} (${code})` })
    return nouveau
  })
}

export function encaisserCreance(
  clientId: number,
  montant: number,
  mode: 'especes' | 'mobile_money' | 'carte' | 'virement' | 'cheque',
  venteId: number | null,
  utilisateurId: number
): void {
  if (montant <= 0) throw new ErreurMetier('Le montant doit être supérieur à zéro.')

  const solde = (
    base().prepare('SELECT solde_du s FROM v_creance_client WHERE client_id = ?').get(clientId) as unknown as
    | { s: number }
      | undefined
  )?.s ?? 0

  if (montant > solde) {
    throw new ErreurMetier(
      `Le règlement (${montant}) dépasse la créance du client (${solde}).`,
      'montant_excessif'
    )
  }

  transaction(() => {
    base()
      .prepare(
        'INSERT INTO client_reglements (client_id, vente_id, montant, mode, created_by) VALUES (?, ?, ?, ?, ?)'
      )
      .run(clientId, venteId, montant, mode, utilisateurId)

    const nom = (base().prepare('SELECT nom FROM clients WHERE id = ?').get(clientId) as unknown as { nom: string } | undefined)?.nom

    journaliser({
      utilisateurId,
      action: 'Règlement client',
      entite: 'client',
      entiteId: clientId,
      resume: `${nom} — ${montant} en ${mode}`
    })
  })
}

export function archiverClient(id: number, archiver: boolean, utilisateurId: number): void {
  const solde = (
    base().prepare('SELECT solde_du s FROM v_creance_client WHERE client_id = ?').get(id) as unknown as { s: number } | undefined
  )?.s ?? 0

  if (archiver && solde > 0) {
    throw new ErreurMetier(`Ce client a une créance de ${solde} en cours.`, 'solde_restant')
  }

  transaction(() => {
    base().prepare('UPDATE clients SET archived_at = ? WHERE id = ?').run(archiver ? maintenant() : null, id)
    journaliser({
      utilisateurId,
      action: archiver ? 'Client archivé' : 'Client restauré',
      entite: 'client',
      entiteId: id,
      resume: ''
    })
  })
}

// ---------------------------------------------------------------------------
// Compte client
// ---------------------------------------------------------------------------

/**
 * Situation d'un compte client, telle qu'affichee au comptoir avant une vente
 * a credit. `disponible` vaut null lorsqu'aucun plafond n'est fixe.
 */
export function apercuCompte(clientId: number): ApercuCompte | null {
  const c = base()
    .prepare(
      `SELECT c.id, c.nom, c.telephone, c.plafond_credit,
              COALESCE(v.solde_du, 0) AS encours,
              COALESCE(v.total_achats, 0) AS total_achats,
              v.derniere_visite,
              (SELECT COUNT(*) FROM ventes WHERE client_id = c.id AND statut = 'finalisee') AS nb_ventes,
              (SELECT MAX(at) FROM client_reglements WHERE client_id = c.id) AS dernier_reglement
       FROM clients c LEFT JOIN v_creance_client v ON v.client_id = c.id
       WHERE c.id = ?`
    )
    .get(clientId) as unknown as
    | {
        id: number
        nom: string
        telephone: string | null
        plafond_credit: number
        encours: number
        total_achats: number
        derniere_visite: string | null
        nb_ventes: number
        dernier_reglement: string | null
      }
    | undefined

  if (!c) return null

  const encours = Math.max(0, c.encours)
  return {
    clientId: c.id,
    nom: c.nom,
    telephone: c.telephone,
    plafond: c.plafond_credit,
    encours,
    disponible: c.plafond_credit > 0 ? Math.max(0, c.plafond_credit - encours) : null,
    nbVentes: c.nb_ventes,
    totalAchats: c.total_achats,
    derniereVisite: c.derniere_visite,
    dernierReglement: c.dernier_reglement
  }
}

/**
 * Releve de compte : mouvements chronologiques et solde courant.
 *
 * Le solde est recalcule ligne a ligne plutot que stocke, afin qu'il reste
 * exact meme apres une annulation de vente ou un regroupement de reglements.
 */
export function releveCompte(clientId: number, depuis?: string): LigneReleve[] {
  const conditions = depuis ? 'AND at >= :depuis' : ''
  const params: Record<string, SQLInputValue> = { clientId }
  if (depuis) params.depuis = debutDeJournee(depuis)

  const lignes = base()
    .prepare(
      `SELECT * FROM (
         SELECT v.at, 'vente' AS type, v.reference,
                'Vente à crédit' AS libelle,
                v.reste_a_payer AS debit, 0 AS credit,
                u.nom_complet AS utilisateur
         FROM ventes v JOIN utilisateurs u ON u.id = v.utilisateur_id
         WHERE v.client_id = :clientId AND v.statut = 'finalisee' AND v.reste_a_payer > 0
         UNION ALL
         SELECT r.at, 'reglement', COALESCE(v.reference, '—'),
                'Règlement en ' || CASE r.mode
                  WHEN 'especes' THEN 'espèces'
                  WHEN 'mobile_money' THEN 'Mobile Money'
                  WHEN 'carte' THEN 'carte bancaire'
                  WHEN 'virement' THEN 'virement'
                  WHEN 'cheque' THEN 'chèque'
                  ELSE r.mode
                END,
                0, r.montant, u.nom_complet
         FROM client_reglements r
         LEFT JOIN ventes v ON v.id = r.vente_id
         LEFT JOIN utilisateurs u ON u.id = r.created_by
         WHERE r.client_id = :clientId
       )
       WHERE 1 = 1 ${conditions}
       ORDER BY at, type DESC`
    )
    .all(params) as unknown as Omit<LigneReleve, 'solde'>[]

  let solde = 0
  return lignes.map((l) => {
    solde += l.debit - l.credit
    return { ...l, solde }
  })
}
