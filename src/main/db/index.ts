import Database from 'better-sqlite3-multiple-ciphers'
import { existsSync, mkdirSync, copyFileSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { cleDuPoste } from './cles'

/**
 * Type des valeurs acceptees par une requete preparee.
 *
 * Declare ici plutot qu'importe du moteur : les services n'ont pas a savoir
 * quel moteur SQLite est en dessous, et en changer ne doit pas se propager
 * dans douze fichiers.
 */
export type ValeurSQL = string | number | bigint | Buffer | null

export type Connexion = Database.Database

import schemaSql from './schema.sql?raw'
import seedSql from './seed.sql?raw'
import migration003 from './migrations/003-impression-et-comptoir.sql?raw'
import migration004 from './migrations/004-theme-clair.sql?raw'
import migration005 from './migrations/005-saisie-assistee.sql?raw'
import migration006 from './migrations/006-exploitation.sql?raw'
import migration007 from './migrations/007-rattrapage-reglages.sql?raw'
import migration008 from './migrations/008-coffre-sauvegardes.sql?raw'

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
  { version: 5, nom: 'saisie-assistee', sql: migration005 },
  { version: 6, nom: 'exploitation', sql: migration006 },
  { version: 7, nom: 'rattrapage-reglages', sql: migration007 },
  { version: 8, nom: 'coffre-sauvegardes', sql: migration008 }
]

export const VERSION_SCHEMA = MIGRATIONS[MIGRATIONS.length - 1]!.version

let db: Database.Database | null = null
let cheminOuvert = ''

/** Ouvre la base, applique les migrations manquantes, renvoie la connexion. */
export function ouvrirBase(chemin: string): Connexion {
  if (db) return db

  const dossier = dirname(chemin)
  mkdirSync(dossier, { recursive: true })

  const cle = cleDuPoste(dossier)

  // Une base d'avant le chiffrement doit etre convertie avant tout usage :
  // c'est le moment ou jamais, la connexion n'est pas encore etablie.
  if (existsSync(chemin) && enClair(chemin)) chiffrerBaseExistante(chemin, cle)

  const connexion = new Database(chemin)
  connexion.pragma("cipher='sqlcipher'")
  connexion.key(cle)

  // Premiere requete : elle echoue si la cle ne correspond pas, et c'est la
  // seule facon de le savoir — SQLite n'ouvre le fichier qu'a la demande.
  try {
    connexion.prepare('SELECT count(*) FROM sqlite_master').get()
  } catch {
    connexion.close()
    throw new Error(
      "Cette base appartient a un autre ordinateur : elle ne peut pas etre ouverte ici. " +
        'Restaurez plutot une sauvegarde.'
    )
  }

  // WAL : lectures concurrentes pendant l'écriture, et surtout une base qui
  // survit à une coupure de courant — cas réel en officine.
  connexion.exec('PRAGMA journal_mode = WAL')
  connexion.exec('PRAGMA foreign_keys = ON')
  connexion.exec('PRAGMA synchronous = NORMAL')
  connexion.exec('PRAGMA busy_timeout = 5000')

  appliquerMigrations(connexion)

  db = connexion
  cheminOuvert = chemin
  return db
}

/** Chemin du fichier actuellement ouvert. */
export function cheminBaseOuvert(): string {
  return cheminOuvert
}

export function base(): Connexion {
  if (!db) throw new Error("La base n'est pas ouverte.")
  return db
}

export function fermerBase(): void {
  if (!db) return
  // Replie le WAL dans le fichier principal : une sauvegarde par copie
  // simple reste alors cohérente.
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    /* la base est peut-être déjà en cours de fermeture */
  }
  db.close()
  db = null
}

function appliquerMigrations(connexion: Connexion): void {
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
      .map((r: unknown) => Number((r as { version: number }).version))
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

/** Vrai si le fichier est une base SQLite ordinaire, donc lisible par tous. */
export function enClair(chemin: string): boolean {
  try {
    const debut = Buffer.alloc(16)
    const fichier = readFileSync(chemin)
    fichier.copy(debut, 0, 0, Math.min(16, fichier.length))
    return debut.subarray(0, 15).toString('latin1') === 'SQLite format 3'
  } catch {
    return false
  }
}

/**
 * Chiffre sur place une base installée avant le chiffrement.
 *
 * Une copie de sécurité est posée à côté avant l'opération : si le courant
 * saute au milieu, l'officine ne perd pas son historique. Elle est supprimée
 * dès que la base chiffrée se relit correctement.
 */
function chiffrerBaseExistante(chemin: string, cle: Buffer): void {
  const filet = `${chemin}.avant-chiffrement`
  copyFileSync(chemin, filet)

  try {
    const connexion = new Database(chemin)
    connexion.pragma("cipher='sqlcipher'")
    connexion.rekey(cle)
    connexion.close()

    // Contrôle avant de retirer le filet : une base illisible après
    // conversion serait une catastrophe silencieuse.
    const controle = new Database(chemin, { readonly: true })
    controle.pragma("cipher='sqlcipher'")
    controle.key(cle)
    controle.prepare('SELECT count(*) FROM sqlite_master').get()
    controle.close()

    rmSync(filet, { force: true })
  } catch (erreur) {
    // Retour à l'état d'avant : mieux vaut une base en clair qu'une base
    // perdue.
    copyFileSync(filet, chemin)
    rmSync(filet, { force: true })
    throw new Error(`Chiffrement de la base impossible : ${(erreur as Error).message}`)
  }
}

/**
 * Écrit une copie EN CLAIR de la base, pour une sauvegarde.
 *
 * Une sauvegarde doit pouvoir repartir sur un autre ordinateur : la recopier
 * telle quelle, chiffrée avec la clé de ce poste-ci, la rendrait inutilisable
 * là où on en aurait besoin. Elle est donc remise en clair puis aussitôt
 * rechiffrée avec la clé du logiciel, par l'appelant.
 */
export function exporterEnClair(cheminBase: string, destination: string): void {
  base().pragma('wal_checkpoint(TRUNCATE)')
  copyFileSync(cheminBase, destination)

  const copie = new Database(destination)
  copie.pragma("cipher='sqlcipher'")
  copie.key(cleDuPoste(dirname(cheminBase)))
  copie.rekey(Buffer.alloc(0))
  copie.close()
}

/** Rechiffre une base en clair avec la clé de CE poste : après restauration. */
export function scellerPourCePoste(chemin: string, dossierBase: string): void {
  const connexion = new Database(chemin)
  connexion.pragma("cipher='sqlcipher'")
  connexion.rekey(cleDuPoste(dossierBase))
  connexion.close()
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

  const fichier = join(dossier, nom)
  exporterEnClair(cheminBase, fichier)

  return { fichier, taille: statSync(fichier).size }
}

/** Vérifie qu'un fichier est bien une base PHARMINA lisible. */
export function verifierSauvegarde(fichier: string): { valide: boolean; version?: number; motif?: string } {
  if (!existsSync(fichier)) return { valide: false, motif: 'Fichier introuvable.' }

  let controle: Database.Database | null = null
  try {
    controle = new Database(fichier, { readonly: true })
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
