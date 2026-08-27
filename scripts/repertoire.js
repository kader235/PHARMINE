/**
 * Compile le répertoire des produits en base SQLite autonome.
 *
 *   src/main/db/repertoire/medicaments.txt  →  resources/repertoire.db
 *
 * Pourquoi un fichier séparé plutôt qu'une table de plus dans la base de
 * l'officine :
 *
 *   — il est livré avec le logiciel et ouvert en lecture seule : aucune
 *     manipulation, aucune restauration de sauvegarde, aucune erreur de
 *     manœuvre ne peut l'altérer ;
 *   — il n'alourdit pas les sauvegardes du pharmacien, qui ne doivent
 *     contenir que ses propres données ;
 *   — il se met à jour en remplaçant un seul fichier, sans migration.
 *
 * Le fichier porte son empreinte : le logiciel vérifie à l'ouverture qu'il
 * n'a pas été remplacé par un fichier tronqué ou étranger.
 *
 * Exécution : npm run repertoire
 */
const Database = require('better-sqlite3-multiple-ciphers')
const { createHash } = require('node:crypto')
const { readFileSync, mkdirSync, rmSync, existsSync, statSync } = require('node:fs')
const { join } = require('node:path')

const RACINE = join(__dirname, '..')
const SOURCE = join(RACINE, 'src', 'main', 'db', 'repertoire', 'medicaments.txt')
const SORTIE = join(RACINE, 'resources', 'repertoire.db')

// Ces identifiants sont ceux du référentiel livré (seed.sql). Le test de bout
// en bout vérifie qu'ils n'ont pas divergé : un répertoire qui pointerait vers
// une forme inexistante remplirait les fiches avec des valeurs fantômes.
const FORMES = {
  'Comprimé': 1, 'Gélule': 2, 'Sirop': 3, 'Suspension buvable': 4,
  'Solution injectable': 5, 'Suppositoire': 6, 'Pommade': 7, 'Crème': 8,
  'Gel': 9, 'Collyre': 10, 'Gouttes': 11, 'Poudre': 12, 'Sachet': 13,
  'Spray': 14, 'Patch': 15, 'Ovule': 16, 'Dispositif médical': 17, 'Autre': 18
}

const CATEGORIES = {
  'Médicament': 1, 'Parapharmacie': 2, 'Hygiène et soins': 3,
  'Matériel médical': 4, 'Nutrition': 5, 'Divers': 6
}

// Unité de vente déduite de la forme : c'est le conditionnement dans lequel
// l'officine délivre habituellement. Le pharmacien peut toujours en changer.
const UNITE_PAR_FORME = {
  'Comprimé': 2, 'Gélule': 2, 'Suppositoire': 2, 'Ovule': 2, 'Patch': 2,
  'Sirop': 4, 'Suspension buvable': 4, 'Collyre': 4, 'Gouttes': 4,
  'Solution injectable': 6,
  'Pommade': 5, 'Crème': 5, 'Gel': 5,
  'Sachet': 7, 'Poudre': 7,
  'Spray': 1, 'Dispositif médical': 1, 'Autre': 1
}

/**
 * Nom sans le dosage final.
 *
 * Le repertoire affiche « Paracetamol 500 mg » parce que c'est ainsi qu'on
 * demande le produit au comptoir. Mais la fiche a deux champs distincts : si
 * on recopiait le libelle entier dans « nom commercial », le dosage
 * apparaitrait deux fois sur l'etiquette et dans la recherche.
 */
function sansDosage(nom) {
  const court = nom
    .replace(/\s+\d[\d\s]*(?:[.,]\d+)?\s*(?:mg|g|µg|mcg|UI|MUI|ml|l|%)\s*$/i, '')
    .trim()
  return court.length >= 3 ? court : nom
}

function lireSource() {
  const brut = readFileSync(SOURCE, 'utf8')
  const produits = []
  const erreurs = []

  brut.split(/\r?\n/).forEach((ligne, index) => {
    const texte = ligne.trim()
    if (!texte || texte.startsWith('#')) return

    const champs = texte.split('|').map((c) => c.trim())
    if (champs.length !== 7) {
      erreurs.push(`ligne ${index + 1} : ${champs.length} champs au lieu de 7`)
      return
    }

    const [nom, dci, dosage, forme, categorie, ordonnance, classe] = champs

    if (!FORMES[forme]) erreurs.push(`ligne ${index + 1} : forme inconnue « ${forme} »`)
    if (!CATEGORIES[categorie]) erreurs.push(`ligne ${index + 1} : catégorie inconnue « ${categorie} »`)
    if (ordonnance !== '0' && ordonnance !== '1') {
      erreurs.push(`ligne ${index + 1} : ordonnance doit valoir 0 ou 1`)
    }
    if (nom.length < 2) erreurs.push(`ligne ${index + 1} : nom trop court`)

    produits.push({
      nom,
      nomCourt: sansDosage(nom),
      dci: dci || null,
      dosage: dosage || null,
      forme,
      formeId: FORMES[forme] ?? null,
      categorie,
      categorieId: CATEGORIES[categorie] ?? null,
      uniteId: UNITE_PAR_FORME[forme] ?? 1,
      ordonnance: Number(ordonnance),
      classe: classe || null
    })
  })

  // Un doublon exact ferait remonter deux fois la même suggestion.
  const vus = new Map()
  for (const p of produits) {
    const cle = `${p.nom.toLowerCase()}|${(p.dosage ?? '').toLowerCase()}`
    if (vus.has(cle)) erreurs.push(`doublon : ${p.nom} ${p.dosage ?? ''}`)
    vus.set(cle, true)
  }

  if (erreurs.length) {
    console.error('Répertoire refusé :')
    for (const e of erreurs) console.error(`  ${e}`)
    process.exit(1)
  }

  return { produits, empreinte: createHash('sha256').update(brut).digest('hex').slice(0, 32) }
}

function construire() {
  const { produits, empreinte } = lireSource()

  mkdirSync(join(RACINE, 'resources'), { recursive: true })
  // On repart d'un fichier neuf : une base recompilée par-dessus l'ancienne
  // garderait les produits retirés de la source.
  for (const reste of [SORTIE, `${SORTIE}-wal`, `${SORTIE}-shm`, `${SORTIE}-journal`]) {
    rmSync(reste, { force: true })
  }

  const db = new Database(SORTIE)

  // Pas de WAL : le fichier sera ouvert en lecture seule, et le mode WAL
  // exige de pouvoir écrire deux fichiers voisins.
  db.exec('PRAGMA journal_mode = DELETE')

  db.exec(`
    CREATE TABLE repertoire (
      id           INTEGER PRIMARY KEY,
      nom          TEXT    NOT NULL,
      nom_court    TEXT    NOT NULL,
      dci          TEXT,
      dosage       TEXT,
      forme        TEXT,
      forme_id     INTEGER,
      categorie    TEXT,
      categorie_id INTEGER,
      unite_id     INTEGER,
      ordonnance   INTEGER NOT NULL DEFAULT 0,
      classe       TEXT
    );

    CREATE VIRTUAL TABLE repertoire_fts USING fts5(
      nom, nom_court, dci, classe,
      content = 'repertoire',
      content_rowid = 'id',
      tokenize = "unicode61 remove_diacritics 2"
    );

    CREATE TABLE repertoire_meta (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL);
  `)

  const inserer = db.prepare(
    `INSERT INTO repertoire
       (id, nom, nom_court, dci, dosage, forme, forme_id, categorie, categorie_id, unite_id, ordonnance, classe)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )

  db.exec('BEGIN')
  produits.forEach((p, i) => {
    inserer.run(
      i + 1, p.nom, p.nomCourt, p.dci, p.dosage, p.forme, p.formeId,
      p.categorie, p.categorieId, p.uniteId, p.ordonnance, p.classe
    )
  })
  db.exec('COMMIT')

  db.exec("INSERT INTO repertoire_fts(repertoire_fts) VALUES('rebuild')")

  const meta = db.prepare('INSERT INTO repertoire_meta (cle, valeur) VALUES (?, ?)')
  meta.run('produits', String(produits.length))
  meta.run('empreinte', empreinte)
  meta.run('compile_le', new Date().toISOString().slice(0, 10))

  db.exec('VACUUM')
  db.close()

  const taille = statSync(SORTIE).size
  const classes = new Set(produits.map((p) => p.classe)).size

  console.log(`Répertoire compilé : ${produits.length} produits, ${classes} classes thérapeutiques`)
  console.log(`  ${SORTIE} — ${Math.round(taille / 1024)} Ko — empreinte ${empreinte.slice(0, 12)}`)
}

if (!existsSync(SOURCE)) {
  console.error(`Source introuvable : ${SOURCE}`)
  process.exit(1)
}

construire()

// Lance par `electron scripts/repertoire.js`, le processus resterait ouvert
// sans fenetre : on rend la main explicitement.
process.exit(0)
