import { base } from '../db'

/** Horodatage UTC au format retenu par le schéma. */
export function maintenant(): string {
  return new Date().toISOString().replace(/(\.\d{3})Z$/, '$1Z')
}

/** Date civile locale, format 'YYYY-MM-DD'. */
export function aujourdhui(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function decalerJours(date: string, jours: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + jours)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Bornes UTC d'un jour civil local.
 *
 * Les horodatages sont stockés en UTC, mais un pharmacien raisonne en jours
 * locaux : sa journée commence à minuit chez lui. Coller un « Z » sur une date
 * civile revient à décaler la fenêtre du décalage horaire, et les ventes
 * tombent alors hors du jour dès que l'heure locale et UTC ne coïncident plus.
 * Ces deux fonctions convertissent explicitement, sans jamais mélanger les deux.
 */
export function debutDeJournee(jour: string): string {
  // Sans « Z », JavaScript interprète la chaîne en heure locale : c'est
  // exactement ce que l'on veut avant de repasser en UTC.
  return new Date(`${jour}T00:00:00`).toISOString()
}

export function finDeJournee(jour: string): string {
  return new Date(`${jour}T23:59:59.999`).toISOString()
}

/** Erreur métier : son message est destiné à l'utilisateur, pas au développeur. */
export class ErreurMetier extends Error {
  constructor(
    message: string,
    readonly code = 'metier',
    readonly detail?: string
  ) {
    super(message)
    this.name = 'ErreurMetier'
  }
}

export function parametre(cle: string): string | null {
  const ligne = base().prepare('SELECT valeur FROM parametres WHERE cle = ?').get(cle) as unknown as
    | { valeur: string | null }
    | undefined
  return ligne?.valeur ?? null
}

export function parametreEntier(cle: string, defaut: number): number {
  const v = parametre(cle)
  if (v === null || v === '') return defaut
  const n = Number(v)
  return Number.isFinite(n) ? n : defaut
}

export function parametreBooleen(cle: string, defaut: boolean): boolean {
  const v = parametre(cle)
  if (v === null || v === '') return defaut
  return v === '1' || v === 'true'
}

export function definirParametre(cle: string, valeur: string, utilisateurId: number): void {
  base()
    .prepare(
      `UPDATE parametres SET valeur = ?, updated_at = ?, updated_by = ? WHERE cle = ?`
    )
    .run(valeur, maintenant(), utilisateurId, cle)
}

/**
 * Numérotation continue par entité : V-00001, A-00001…
 * Le compteur repart du plus grand numéro déjà attribué, ce qui reste correct
 * même après restauration d'une sauvegarde.
 */
export function prochaineReference(prefixe: string, table: string, colonne = 'reference'): string {
  const ligne = base()
    .prepare(
      `SELECT ${colonne} AS r FROM ${table}
       WHERE ${colonne} LIKE ? ORDER BY LENGTH(${colonne}) DESC, ${colonne} DESC LIMIT 1`
    )
    .get(`${prefixe}-%`) as unknown as { r: string } | undefined

  const dernier = ligne ? Number(ligne.r.slice(prefixe.length + 1)) : 0
  const suivant = (Number.isFinite(dernier) ? dernier : 0) + 1
  return `${prefixe}-${String(suivant).padStart(5, '0')}`
}

export interface EntreeJournal {
  utilisateurId: number | null
  action: string
  entite: string
  entiteId?: number | null
  resume: string
  details?: unknown
  resultat?: 'succes' | 'echec' | 'refuse'
}

/** Trace une opération importante. Appelé à l'intérieur des transactions métier. */
export function journaliser(entree: EntreeJournal): void {
  base()
    .prepare(
      `INSERT INTO journal_activite (utilisateur_id, action, entite, entite_id, resume, details, resultat)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      entree.utilisateurId,
      entree.action,
      entree.entite,
      entree.entiteId ?? null,
      entree.resume,
      entree.details === undefined ? null : JSON.stringify(entree.details),
      entree.resultat ?? 'succes'
    )
}

/** Convertit les `undefined` en `null` : node:sqlite refuse `undefined`. */
export function n<T>(valeur: T | undefined | null): T | null {
  return valeur === undefined ? null : valeur
}
