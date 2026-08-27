/**
 * Répertoire des produits pharmaceutiques.
 *
 * Saisir un produit, c'est normalement taper huit champs. Ici, le pharmacien
 * tape trois lettres, choisit dans la liste, et il ne lui reste que ses prix
 * à renseigner — les seules valeurs que le logiciel ne peut pas connaître.
 *
 * Le répertoire vit dans un fichier séparé, livré avec le logiciel et ouvert
 * en LECTURE SEULE. Il ne fait pas partie de la base de l'officine : rien de
 * ce que fait l'utilisateur ne peut l'abîmer, il n'alourdit pas les
 * sauvegardes, et le mettre à jour revient à remplacer un fichier.
 *
 * Son absence n'est jamais une erreur bloquante : la saisie manuelle reste
 * possible, simplement sans suggestions.
 */
import Database from 'better-sqlite3-multiple-ciphers'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

import { base } from '../db'

export interface FicheRepertoire {
  id: number
  nom: string
  /** Nom sans le dosage : ce qui va dans le champ « nom commercial ». */
  nomCourt: string
  dci: string | null
  dosage: string | null
  forme: string | null
  formeId: number | null
  categorie: string | null
  categorieId: number | null
  uniteId: number | null
  ordonnance: boolean
  classe: string | null
  /** Le catalogue de l'officine contient-il déjà ce produit ? */
  dejaAuCatalogue?: boolean
}

export interface EtatRepertoire {
  disponible: boolean
  produits: number
  empreinte: string | null
  compileLe: string | null
  motif?: string
}

let connexion: Database.Database | null = null
let etatConnu: EtatRepertoire | null = null

/** Emplacements possibles, du plus probable au dernier recours. */
function emplacements(): string[] {
  const chemins: string[] = []
  // Application installée : le fichier est copié dans les ressources.
  if (process.resourcesPath) chemins.push(join(process.resourcesPath, 'repertoire.db'))
  // Développement et tests : le dépôt lui-même.
  try {
    chemins.push(join(app.getAppPath(), 'resources', 'repertoire.db'))
  } catch {
    /* hors contexte Electron */
  }
  chemins.push(join(process.cwd(), 'resources', 'repertoire.db'))
  return chemins
}

function ouvrir(): Database.Database | null {
  if (connexion) return connexion
  if (etatConnu && !etatConnu.disponible) return null

  const chemin = emplacements().find((c) => existsSync(c))
  if (!chemin) {
    etatConnu = {
      disponible: false,
      produits: 0,
      empreinte: null,
      compileLe: null,
      motif: 'Fichier du répertoire introuvable.'
    }
    return null
  }

  try {
    const db = new Database(chemin, { readonly: true })

    // Un fichier tronqué ou remplacé se signale ici, pas au milieu d'une
    // saisie : on préfère désactiver la suggestion plutôt que de proposer
    // des fiches douteuses.
    const attendu = db
      .prepare("SELECT valeur FROM repertoire_meta WHERE cle = 'produits'")
      .get() as unknown as { valeur: string } | undefined
    const reel = (db.prepare('SELECT COUNT(*) n FROM repertoire').get() as unknown as { n: number }).n

    if (!attendu || Number(attendu.valeur) !== reel) {
      db.close()
      etatConnu = {
        disponible: false,
        produits: 0,
        empreinte: null,
        compileLe: null,
        motif: 'Le répertoire ne correspond pas à son empreinte : il a été modifié ou tronqué.'
      }
      return null
    }

    const lireMeta = (cle: string): string | null => {
      const ligne = db
        .prepare('SELECT valeur FROM repertoire_meta WHERE cle = ?')
        .get(cle) as unknown as { valeur: string } | undefined
      return ligne?.valeur ?? null
    }

    etatConnu = {
      disponible: true,
      produits: reel,
      empreinte: lireMeta('empreinte'),
      compileLe: lireMeta('compile_le')
    }
    connexion = db
    return db
  } catch (erreur) {
    etatConnu = {
      disponible: false,
      produits: 0,
      empreinte: null,
      compileLe: null,
      motif: (erreur as Error).message
    }
    return null
  }
}

export function etat(): EtatRepertoire {
  ouvrir()
  return etatConnu ?? { disponible: false, produits: 0, empreinte: null, compileLe: null }
}

export function fermer(): void {
  connexion?.close()
  connexion = null
  etatConnu = null
}

function requeteFts(saisie: string): string | null {
  const termes = saisie
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => `"${t.replace(/"/g, '""')}"*`)
  return termes.length ? termes.join(' ') : null
}

function convertir(ligne: Record<string, unknown>): FicheRepertoire {
  return {
    id: Number(ligne.id),
    nom: String(ligne.nom),
    nomCourt: String(ligne.nom_court ?? ligne.nom),
    dci: (ligne.dci as string) ?? null,
    dosage: (ligne.dosage as string) ?? null,
    forme: (ligne.forme as string) ?? null,
    formeId: ligne.forme_id === null ? null : Number(ligne.forme_id),
    categorie: (ligne.categorie as string) ?? null,
    categorieId: ligne.categorie_id === null ? null : Number(ligne.categorie_id),
    uniteId: ligne.unite_id === null ? null : Number(ligne.unite_id),
    ordonnance: Number(ligne.ordonnance) === 1,
    classe: (ligne.classe as string) ?? null
  }
}


/**
 * Marque les fiches que l'officine possede déjà.
 *
 * Sans ce repérage, un pharmacien presse recrée un produit qui existe sous
 * un autre dosage, et le stock se retrouve éclaté sur deux lignes.
 */
function marquerExistants(fiches: FicheRepertoire[]): FicheRepertoire[] {
  if (fiches.length === 0) return fiches

  try {
    const noms = base()
      .prepare(
        `SELECT LOWER(nom_commercial) nom, LOWER(COALESCE(dosage, '')) dosage
         FROM produits WHERE archived_at IS NULL`
      )
      .all() as unknown as { nom: string; dosage: string }[]

    const connus = new Set(noms.map((p) => `${p.nom}|${p.dosage}`))
    const dosage = (f: FicheRepertoire): string => (f.dosage ?? '').toLowerCase()

    // Deux écritures possibles selon la façon dont le produit a été saisi :
    // « Doliprane » + dosage « 500 mg » si la fiche a servi de modèle, ou
    // « Doliprane 500 mg » d'un seul tenant si la saisie a été libre.
    return fiches.map((f) => ({
      ...f,
      dejaAuCatalogue:
        connus.has(`${f.nomCourt.toLowerCase()}|${dosage(f)}`) ||
        connus.has(`${f.nom.toLowerCase()}|${dosage(f)}`) ||
        connus.has(`${f.nom.toLowerCase()}|`)
    }))
  } catch {
    // Base de l'officine indisponible : la suggestion reste utilisable.
    return fiches
  }
}

/**
 * Cherche dans le répertoire. Une lettre suffit à afficher quelque chose :
 * la personne au comptoir n'a pas à taper le mot entier.
 */
export function rechercher(saisie: string, limite = 12): FicheRepertoire[] {
  const db = ouvrir()
  const terme = saisie.trim()
  if (!db || terme.length < 1) return []

  const expression = requeteFts(terme)

  const lignes = expression
    ? interroger(
        db,
        `SELECT r.* FROM repertoire_fts f
         JOIN repertoire r ON r.id = f.rowid
         WHERE repertoire_fts MATCH ?
         ORDER BY rank, r.nom
         LIMIT ?`,
        [expression, limite]
      ) ??
      // Syntaxe rejetée par FTS : on n'échoue pas une saisie pour cela.
      interroger(db, 'SELECT * FROM repertoire WHERE nom LIKE ? ORDER BY nom LIMIT ?', [
        `%${terme}%`,
        limite
      ]) ??
      []
    : // Une seule lettre : un préfixe simple, instantané sur quelques
      // centaines de lignes.
      interroger(
        db,
        'SELECT * FROM repertoire WHERE nom LIKE ? OR dci LIKE ? ORDER BY nom LIMIT ?',
        [`${terme}%`, `${terme}%`, limite]
      ) ?? []

  return marquerExistants(lignes.map(convertir))
}

function interroger(
  db: Database.Database,
  sql: string,
  parametres: (string | number)[]
): Record<string, unknown>[] | null {
  try {
    return db.prepare(sql).all(...parametres) as unknown as Record<string, unknown>[]
  } catch {
    return null
  }
}

/** Fiche unique, pour pré-remplir un formulaire. */
export function fiche(id: number): FicheRepertoire | null {
  const db = ouvrir()
  if (!db) return null
  const ligne = db.prepare('SELECT * FROM repertoire WHERE id = ?').get(id) as unknown as
    | Record<string, unknown>
    | undefined
  return ligne ? convertir(ligne) : null
}

/** Les classes thérapeutiques présentes, pour situer une fiche. */
export function classes(): string[] {
  const db = ouvrir()
  if (!db) return []
  return (
    db
      .prepare('SELECT DISTINCT classe FROM repertoire WHERE classe IS NOT NULL ORDER BY classe')
      .all() as unknown as { classe: string }[]
  ).map((l) => l.classe)
}
