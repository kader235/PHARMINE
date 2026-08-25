import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

import schemaSql from './schema.sql?raw'
import seedSql from './seed.sql?raw'
import migration003 from './migrations/003-impression-et-comptoir.sql?raw'
import migration004 from './migrations/004-theme-clair.sql?raw'
import migration005 from './migrations/005-saisie-assistee.sql?raw'

/**
 * Migrations du schéma.
 *
 * Une migration n'est jamais modifiée après publication : on en ajoute une
 * nouvelle. `schema.sql` décrit l'état cible d'une base neuve ; les migrations
 * suivantes amènent une base existante jusqu'à ce même état.
 */
const MIGRATIONS: { version: number; nom: string; sql: string }[] = [
  { version: 1, nom: 'schema-initial', sql: schemaSql },
  { version: 2, nom: 'referentiel-de-base', sql: seedSql },
  { version: 3, nom: 'impression-et-comptoir', sql: migration003 },
  { version: 4, nom: 'theme-clair', sql: migration004 },
  { version: 5, nom: 'saisie-assistee', sql: migration005 }
]

export const VERSION_SCHEMA = MIGRATIONS[MIGRATIONS.length - 1]!.version

let db: DatabaseSync | null = null

/** Ouvre la base, applique les migrations manquantes, renvoie la connexion. */
export function ouvrirBase(chemin: string): DatabaseSync {
  if (db) return db

  mkdirSync(dirname(chemin), { recursive: true })
  const connexion = new DatabaseSync(chemin)

  // WAL : lectures concurrentes pendant l'écriture, et surtout une base qui
  // survit à une coupure de courant — cas réel en officine.
  connexion.exec('PRAGMA journal_mode = WAL')
  connexion.exec('PRAGMA foreign_keys = ON')
  connexion.exec('PRAGMA synchronous = NORMAL')
  connexion.exec('PRAGMA busy_timeout = 5000')

  appliquerMigrations(connexion)

  db = connexion
  return db
}

export function base(): DatabaseSync {
  if (!db) throw new Error("La base n'est pas ouverte.")
  return db
}

export function fermerBase(): void {
  if (!db) return
  // Replie le WAL dans le fichier principal : une sauvegarde par copie
  // simple reste alors cohérente.
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  } catch {
    /* la base est peut-être déjà en cours de fermeture */
  }
  db.close()
  db = null
}

function appliquerMigrations(connexion: DatabaseSync): void {
  connexion.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      nom        TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `)

  const appliquees = new Set(
    connexion
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((r) => Number((r as { version: number }).version))
  )

  for (const migration of MIGRATIONS) {
    if (appliquees.has(migration.version)) continue

    // Chaque migration est atomique : elle passe entièrement ou pas du tout.
    connexion.exec('BEGIN')
    try {
      connexion.exec(migration.sql)
      connexion
        .prepare('INSERT INTO schema_migrations (version, nom) VALUES (?, ?)')
        .run(migration.version, migration.nom)
      connexion.exec('COMMIT')
    } catch (erreur) {
      connexion.exec('ROLLBACK')
      throw new Error(
        `Migration ${migration.version} (${migration.nom}) impossible : ${(erreur as Error).message}`
      )
    }
  }
}

let profondeurTransaction = 0

/**
 * Exécute `action` dans une transaction. Toute exception annule l'ensemble.
 * Une vente, une réception ou une validation d'inventaire touchent plusieurs
 * tables : elles doivent réussir entièrement ou ne rien laisser derrière elles.
 *
 * Ré-entrante : une opération métier en appelle souvent une autre qui est
 * elle-même transactionnelle (une vente rafraîchit les alertes, une
 * configuration crée un utilisateur). Les appels imbriqués ouvrent un point de
 * sauvegarde plutôt qu'une seconde transaction — que SQLite refuserait — et
 * c'est la transaction la plus externe qui valide ou annule l'ensemble.
 */
export function transaction<T>(action: () => T): T {
  const connexion = base()
  const imbriquee = profondeurTransaction > 0
  const point = `pt_${profondeurTransaction}`

  connexion.exec(imbriquee ? `SAVEPOINT ${point}` : 'BEGIN IMMEDIATE')
  profondeurTransaction++

  try {
    const resultat = action()
    connexion.exec(imbriquee ? `RELEASE ${point}` : 'COMMIT')
    profondeurTransaction--
    return resultat
  } catch (erreur) {
    profondeurTransaction--
    try {
      connexion.exec(imbriquee ? `ROLLBACK TO ${point}; RELEASE ${point}` : 'ROLLBACK')
    } catch {
      /* la transaction a déjà été annulée */
    }
    throw erreur
  }
}

/**
 * Copie la base vers `dossier`. Le point de contrôle WAL est replié d'abord
 * pour que la copie soit complète et cohérente.
 */
export function sauvegarder(cheminBase: string, dossier: string, nom: string): { fichier: string; taille: number } {
  mkdirSync(dossier, { recursive: true })
  base().exec('PRAGMA wal_checkpoint(TRUNCATE)')

  const fichier = join(dossier, nom)
  copyFileSync(cheminBase, fichier)

  return { fichier, taille: statSync(fichier).size }
}

/** Vérifie qu'un fichier est bien une base PHARMINA lisible. */
export function verifierSauvegarde(fichier: string): { valide: boolean; version?: number; motif?: string } {
  if (!existsSync(fichier)) return { valide: false, motif: 'Fichier introuvable.' }

  let controle: DatabaseSync | null = null
  try {
    controle = new DatabaseSync(fichier, { readOnly: true })
    const integrite = controle.prepare('PRAGMA integrity_check').get() as unknown as { integrity_check: string }
    if (integrite.integrity_check !== 'ok') {
      return { valide: false, motif: 'Le fichier est endommagé.' }
    }
    const version = controle.prepare('SELECT MAX(version) v FROM schema_migrations').get() as unknown as { v: number | null }
    if (version.v === null) return { valide: false, motif: "Ce fichier n'est pas une base PHARMINA." }
    return { valide: true, version: version.v }
  } catch (erreur) {
    return { valide: false, motif: (erreur as Error).message }
  } finally {
    controle?.close()
  }
}
