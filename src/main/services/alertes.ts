import { base, transaction } from '../db'
import type { Alerte, PrioriteAlerte } from '@shared/types'
import { aujourdhui, decalerJours, journaliser, maintenant, parametreEntier } from './commun'

interface AlerteCalculee {
  cle: string
  type: string
  priorite: PrioriteAlerte
  titre: string
  message: string
  entite?: string | null
  entiteId?: number | null
}

/**
 * Les alertes sont recalculées depuis l'état réel de la base, jamais accumulées.
 * Une situation résolue fait disparaître son alerte sans intervention : c'est ce
 * qui évite un centre d'alertes rempli d'avertissements obsolètes.
 *
 * La clé identifie la situation, pas l'occurrence : la même rupture ne crée pas
 * une nouvelle alerte à chaque calcul, et son statut « lue » est conservé.
 */
export function calculerAlertes(): AlerteCalculee[] {
  const alertes: AlerteCalculee[] = []
  const seuilPeremption = parametreEntier('peremption.seuil_alerte_jours', 90)

  const ruptures = base()
    .prepare(
      `SELECT id, nom_commercial FROM v_produit_etat
       WHERE archived_at IS NULL AND etat_stock = 'rupture' AND vente_autorisee = 1
       ORDER BY nom_commercial`
    )
    .all() as unknown as { id: number; nom_commercial: string }[]

  for (const p of ruptures) {
    alertes.push({
      cle: `rupture:${p.id}`,
      type: 'rupture',
      priorite: 'urgent',
      titre: 'Produit en rupture',
      message: `${p.nom_commercial} est en rupture de stock.`,
      entite: 'produit',
      entiteId: p.id
    })
  }

  const faibles = base()
    .prepare(
      `SELECT id, nom_commercial, stock_disponible, stock_min FROM v_produit_etat
       WHERE archived_at IS NULL AND etat_stock = 'faible' AND vente_autorisee = 1
       ORDER BY nom_commercial`
    )
    .all() as unknown as { id: number; nom_commercial: string; stock_disponible: number; stock_min: number }[]

  for (const p of faibles) {
    alertes.push({
      cle: `stock_faible:${p.id}`,
      type: 'stock_faible',
      priorite: 'important',
      titre: 'Stock faible',
      message: `${p.nom_commercial} : ${p.stock_disponible} en stock pour un seuil de ${p.stock_min}.`,
      entite: 'produit',
      entiteId: p.id
    })
  }

  const expires = base()
    .prepare(
      `SELECT lot_id, numero, nom_commercial, quantite_restante, date_peremption, produit_id
       FROM v_peremptions WHERE palier = 'expire' ORDER BY date_peremption`
    )
    .all() as unknown as {
    lot_id: number
    numero: string | null
    nom_commercial: string
    quantite_restante: number
    date_peremption: string
    produit_id: number
  }[]

  for (const l of expires) {
    alertes.push({
      cle: `produit_expire:${l.lot_id}`,
      type: 'produit_expire',
      priorite: 'urgent',
      titre: 'Produit périmé en rayon',
      message: `${l.nom_commercial} — lot ${l.numero ?? 'sans numéro'} : ${l.quantite_restante} unité(s) périmée(s) le ${l.date_peremption}.`,
      entite: 'lot',
      entiteId: l.lot_id
    })
  }

  const proches = base()
    .prepare(
      `SELECT COUNT(*) n, COALESCE(SUM(valeur), 0) v FROM v_peremptions
       WHERE palier IN ('j7','j30','j90') AND jours_restants <= ?`
    )
    .get(seuilPeremption) as unknown as { n: number; v: number }

  if (proches.n > 0) {
    alertes.push({
      cle: 'peremption_proche',
      type: 'peremption_proche',
      priorite: 'important',
      titre: 'Péremptions à surveiller',
      message: `${proches.n} lot(s) expirent dans moins de ${seuilPeremption} jours.`,
      entite: 'peremptions',
      entiteId: null
    })
  }

  // Caisse restée ouverte au-delà de la journée : oubli de clôture.
  const caisse = base()
    .prepare(
      `SELECT c.id, c.reference, c.ouverte_at, u.nom_complet
       FROM caisse_sessions c JOIN utilisateurs u ON u.id = c.utilisateur_id
       WHERE c.statut = 'ouverte' AND substr(c.ouverte_at, 1, 10) < ?`
    )
    .get(aujourdhui()) as unknown as
    | { id: number; reference: string; ouverte_at: string; nom_complet: string }
    | undefined

  if (caisse) {
    alertes.push({
      cle: `caisse_non_cloturee:${caisse.id}`,
      type: 'caisse_non_cloturee',
      priorite: 'urgent',
      titre: 'Caisse non clôturée',
      message: `La caisse ${caisse.reference}, ouverte par ${caisse.nom_complet}, n’a pas été clôturée.`,
      entite: 'caisse',
      entiteId: caisse.id
    })
  }

  const dettes = base()
    .prepare('SELECT fournisseur_id, nom, solde_du FROM v_dette_fournisseur WHERE solde_du > 0 ORDER BY solde_du DESC')
    .all() as unknown as { fournisseur_id: number; nom: string; solde_du: number }[]

  for (const d of dettes) {
    alertes.push({
      cle: `dette_fournisseur:${d.fournisseur_id}`,
      type: 'dette_fournisseur',
      priorite: 'information',
      titre: 'Dette fournisseur',
      message: `${d.nom} : ${d.solde_du} restant dû.`,
      entite: 'fournisseur',
      entiteId: d.fournisseur_id
    })
  }

  const creances = base()
    .prepare('SELECT client_id, nom, solde_du FROM v_creance_client WHERE solde_du > 0 ORDER BY solde_du DESC')
    .all() as unknown as { client_id: number; nom: string; solde_du: number }[]

  for (const c of creances) {
    alertes.push({
      cle: `creance_client:${c.client_id}`,
      type: 'creance_client',
      priorite: 'information',
      titre: 'Créance client',
      message: `${c.nom} : ${c.solde_du} restant dû.`,
      entite: 'client',
      entiteId: c.client_id
    })
  }

  const inventaire = base()
    .prepare(
      `SELECT id, reference, ouvert_at FROM inventaires
       WHERE statut = 'en_cours' AND substr(ouvert_at, 1, 10) < ?`
    )
    .get(decalerJours(aujourdhui(), -1)) as unknown as { id: number; reference: string } | undefined

  if (inventaire) {
    alertes.push({
      cle: `inventaire_en_cours:${inventaire.id}`,
      type: 'inventaire_en_cours',
      priorite: 'important',
      titre: 'Inventaire non validé',
      message: `L’inventaire ${inventaire.reference} est ouvert depuis plus d’une journée.`,
      entite: 'inventaire',
      entiteId: inventaire.id
    })
  }

  const derniere = base()
    .prepare("SELECT MAX(at) a FROM sauvegardes WHERE statut = 'ok'")
    .get() as unknown as { a: string | null }

  if (derniere.a === null || derniere.a.slice(0, 10) < decalerJours(aujourdhui(), -7)) {
    alertes.push({
      cle: 'sauvegarde',
      type: 'sauvegarde',
      priorite: 'important',
      titre: 'Sauvegarde ancienne',
      message: derniere.a
        ? `La dernière sauvegarde date du ${derniere.a.slice(0, 10)}.`
        : 'Aucune sauvegarde n’a encore été effectuée.',
      entite: 'sauvegarde',
      entiteId: null
    })
  }

  return alertes
}

/** Synchronise la table des alertes avec la situation calculée. */
export function rafraichirAlertes(): void {
  const calculees = calculerAlertes()
  const cles = new Set(calculees.map((a) => a.cle))

  transaction(() => {
    for (const a of calculees) {
      base()
        .prepare(
          `INSERT INTO alertes (cle, type, priorite, titre, message, entite, entite_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (cle) DO UPDATE SET
             priorite = excluded.priorite,
             titre    = excluded.titre,
             message  = excluded.message,
             resolue_at = NULL`
        )
        .run(a.cle, a.type, a.priorite, a.titre, a.message, a.entite ?? null, a.entiteId ?? null)
    }

    // Ce qui n'est plus calculé n'est plus un problème : on le marque résolu
    // plutôt que de le supprimer, pour garder la trace dans l'historique.
    const existantes = base()
      .prepare('SELECT cle FROM alertes WHERE resolue_at IS NULL')
      .all() as unknown as { cle: string }[]

    for (const e of existantes) {
      if (!cles.has(e.cle)) {
        base().prepare('UPDATE alertes SET resolue_at = ? WHERE cle = ?').run(maintenant(), e.cle)
      }
    }
  })
}

export function listerAlertes(inclureResolues = false): Alerte[] {
  return base()
    .prepare(
      `SELECT * FROM alertes
       ${inclureResolues ? '' : 'WHERE resolue_at IS NULL'}
       ORDER BY CASE priorite WHEN 'urgent' THEN 0 WHEN 'important' THEN 1 ELSE 2 END,
                created_at DESC`
    )
    .all() as unknown as Alerte[]
}

export function compterAlertes(): { urgent: number; important: number; information: number; total: number } {
  const lignes = base()
    .prepare('SELECT priorite, COUNT(*) n FROM alertes WHERE resolue_at IS NULL GROUP BY priorite')
    .all() as unknown as { priorite: PrioriteAlerte; n: number }[]

  const compte = { urgent: 0, important: 0, information: 0, total: 0 }
  for (const l of lignes) {
    compte[l.priorite] = l.n
    compte.total += l.n
  }
  return compte
}

export function marquerLues(cles: string[], utilisateurId: number): void {
  if (!cles.length) return
  transaction(() => {
    const at = maintenant()
    for (const cle of cles) {
      base()
        .prepare('UPDATE alertes SET lue_at = ?, lue_par = ? WHERE cle = ? AND lue_at IS NULL')
        .run(at, utilisateurId, cle)
    }
    journaliser({
      utilisateurId,
      action: 'Alertes marquées comme lues',
      entite: 'alerte',
      resume: `${cles.length} alerte(s)`
    })
  })
}
