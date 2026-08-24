import { base, transaction } from '../db'
import type { CaisseSession, EtatCaisse, ModePaiement } from '@shared/types'
import { ErreurMetier, journaliser, maintenant, parametreEntier, prochaineReference } from './commun'

export function sessionOuverte(): CaisseSession | null {
  return (
    (base()
      .prepare(
        `SELECT c.*, u.nom_complet AS utilisateur
         FROM caisse_sessions c JOIN utilisateurs u ON u.id = c.utilisateur_id
         WHERE c.statut = 'ouverte'`
      )
      .get() as CaisseSession | undefined) ?? null
  )
}

/**
 * Photographie de la caisse en cours. Le théorique en espèces est recalculé
 * depuis les mouvements — il n'est jamais stocké, donc jamais faux.
 */
export function etatCaisse(): EtatCaisse {
  const session = sessionOuverte()
  const vide: EtatCaisse = {
    session: null,
    fondInitial: 0,
    encaisseEspeces: 0,
    autresEncaissements: [],
    sorties: 0,
    depenses: 0,
    theoriqueEspeces: 0,
    nbVentes: 0,
    totalVentes: 0
  }
  if (!session) return vide

  const somme = (sql: string, params: unknown[] = []): number => {
    const l = base().prepare(sql).get(...(params as never[])) as { s: number | null }
    return l?.s ?? 0
  }

  const encaisseEspeces = somme(
    `SELECT SUM(montant) s FROM caisse_mouvements
     WHERE session_id = ? AND mode = 'especes' AND type IN ('vente','entree')`,
    [session.id]
  )
  const sorties = somme(
    `SELECT SUM(-montant) s FROM caisse_mouvements
     WHERE session_id = ? AND type IN ('sortie','remboursement')`,
    [session.id]
  )
  const depenses = somme(
    `SELECT SUM(-montant) s FROM caisse_mouvements WHERE session_id = ? AND type = 'depense'`,
    [session.id]
  )
  const corrections = somme(
    `SELECT SUM(montant) s FROM caisse_mouvements WHERE session_id = ? AND type = 'correction'`,
    [session.id]
  )

  const autres = base()
    .prepare(
      `SELECT mode, SUM(montant) montant FROM caisse_mouvements
       WHERE session_id = ? AND type = 'vente' AND mode <> 'especes'
       GROUP BY mode ORDER BY mode`
    )
    .all(session.id) as { mode: ModePaiement; montant: number }[]

  const ventes = base()
    .prepare(
      `SELECT COUNT(*) n, COALESCE(SUM(total), 0) t FROM ventes
       WHERE caisse_session_id = ? AND statut = 'finalisee'`
    )
    .get(session.id) as { n: number; t: number }

  return {
    session,
    fondInitial: session.fond_initial,
    encaisseEspeces,
    autresEncaissements: autres,
    sorties,
    depenses,
    theoriqueEspeces: session.fond_initial + encaisseEspeces - sorties - depenses + corrections,
    nbVentes: ventes.n,
    totalVentes: ventes.t
  }
}

export function ouvrirCaisse(fondInitial: number, utilisateurId: number): CaisseSession {
  if (fondInitial < 0) throw new ErreurMetier('Le fond de caisse ne peut pas être négatif.')
  if (sessionOuverte()) {
    throw new ErreurMetier(
      'Une caisse est déjà ouverte. Clôturez-la avant d’en ouvrir une nouvelle.',
      'caisse_deja_ouverte'
    )
  }

  return transaction(() => {
    const reference = prochaineReference('C', 'caisse_sessions')
    const resultat = base()
      .prepare('INSERT INTO caisse_sessions (reference, utilisateur_id, fond_initial) VALUES (?, ?, ?)')
      .run(reference, utilisateurId, fondInitial)

    const id = Number(resultat.lastInsertRowid)

    if (fondInitial > 0) {
      base()
        .prepare(
          `INSERT INTO caisse_mouvements (session_id, type, montant, mode, motif, reference_type, utilisateur_id)
           VALUES (?, 'fond_initial', ?, 'especes', 'Ouverture de caisse', 'manuel', ?)`
        )
        .run(id, fondInitial, utilisateurId)
    }

    journaliser({
      utilisateurId,
      action: 'Caisse ouverte',
      entite: 'caisse',
      entiteId: id,
      resume: `${reference} — fond initial ${fondInitial}`
    })

    return sessionOuverte()!
  })
}

export interface ResultatCloture {
  session: CaisseSession
  theorique: number
  compte: number
  ecart: number
}

export function cloturerCaisse(
  totalCompte: number,
  justification: string | null,
  utilisateurId: number
): ResultatCloture {
  const etat = etatCaisse()
  if (!etat.session) throw new ErreurMetier('Aucune caisse ouverte.', 'caisse_fermee')
  if (totalCompte < 0) throw new ErreurMetier('Le montant compté ne peut pas être négatif.')

  const ecart = totalCompte - etat.theoriqueEspeces
  const tolere = parametreEntier('caisse.ecart_tolere', 0)

  if (Math.abs(ecart) > tolere && !justification?.trim()) {
    throw new ErreurMetier(
      `L’écart de caisse est de ${ecart > 0 ? '+' : ''}${ecart}. Une justification est obligatoire.`,
      'justification_requise'
    )
  }

  return transaction(() => {
    const at = maintenant()
    base()
      .prepare(
        `UPDATE caisse_sessions
         SET statut = 'fermee', fermee_at = ?, fermee_par = ?,
             total_theorique = ?, total_compte = ?, ecart = ?, justification = ?
         WHERE id = ?`
      )
      .run(at, utilisateurId, etat.theoriqueEspeces, totalCompte, ecart, justification ?? null, etat.session!.id)

    journaliser({
      utilisateurId,
      action: 'Caisse clôturée',
      entite: 'caisse',
      entiteId: etat.session!.id,
      resume: `${etat.session!.reference} — théorique ${etat.theoriqueEspeces}, compté ${totalCompte}, écart ${ecart}`,
      details: { justification }
    })

    const session = base()
      .prepare(
        `SELECT c.*, u.nom_complet AS utilisateur
         FROM caisse_sessions c JOIN utilisateurs u ON u.id = c.utilisateur_id WHERE c.id = ?`
      )
      .get(etat.session!.id) as CaisseSession

    return { session, theorique: etat.theoriqueEspeces, compte: totalCompte, ecart }
  })
}

export interface DemandeMouvementCaisse {
  type: 'entree' | 'sortie' | 'correction'
  montant: number
  motif: string
  mode?: ModePaiement
}

export function mouvementCaisse(demande: DemandeMouvementCaisse, utilisateurId: number): void {
  const session = sessionOuverte()
  if (!session) throw new ErreurMetier('Aucune caisse ouverte.', 'caisse_fermee')
  if (demande.montant <= 0) throw new ErreurMetier('Le montant doit être supérieur à zéro.')
  if (!demande.motif?.trim()) throw new ErreurMetier('Un motif est obligatoire.')

  const signe = demande.type === 'sortie' ? -1 : 1

  transaction(() => {
    base()
      .prepare(
        `INSERT INTO caisse_mouvements (session_id, type, montant, mode, motif, reference_type, utilisateur_id)
         VALUES (?, ?, ?, ?, ?, 'manuel', ?)`
      )
      .run(session.id, demande.type, signe * demande.montant, demande.mode ?? 'especes', demande.motif, utilisateurId)

    journaliser({
      utilisateurId,
      action: demande.type === 'sortie' ? 'Sortie de caisse' : demande.type === 'entree' ? 'Entrée de caisse' : 'Correction de caisse',
      entite: 'caisse',
      entiteId: session.id,
      resume: `${demande.montant} — ${demande.motif}`
    })
  })
}

/** Écrit le mouvement correspondant à un encaissement. Suppose une transaction ouverte. */
export function encaisser(
  sessionId: number,
  mode: ModePaiement,
  montant: number,
  venteId: number,
  utilisateurId: number
): void {
  base()
    .prepare(
      `INSERT INTO caisse_mouvements (session_id, type, montant, mode, motif, reference_type, reference_id, utilisateur_id)
       VALUES (?, 'vente', ?, ?, NULL, 'vente', ?, ?)`
    )
    .run(sessionId, montant, mode, venteId, utilisateurId)
}

export function historiqueSessions(limite = 50): CaisseSession[] {
  return base()
    .prepare(
      `SELECT c.*, u.nom_complet AS utilisateur
       FROM caisse_sessions c JOIN utilisateurs u ON u.id = c.utilisateur_id
       ORDER BY c.ouverte_at DESC LIMIT ?`
    )
    .all(limite) as CaisseSession[]
}

export function mouvementsSession(sessionId: number): {
  id: number
  at: string
  type: string
  montant: number
  mode: string
  motif: string | null
  reference: string | null
  utilisateur: string | null
}[] {
  return base()
    .prepare(
      `SELECT m.id, m.at, m.type, m.montant, m.mode, m.motif,
              v.reference, u.nom_complet AS utilisateur
       FROM caisse_mouvements m
       LEFT JOIN ventes v ON m.reference_type = 'vente' AND v.id = m.reference_id
       LEFT JOIN utilisateurs u ON u.id = m.utilisateur_id
       WHERE m.session_id = ?
       ORDER BY m.at DESC, m.id DESC`
    )
    .all(sessionId) as never
}
