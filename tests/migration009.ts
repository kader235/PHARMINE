/**
 * La migration 9 sur les données réelles de l'officine.
 *
 * Une migration se juge sur une seule question : les chiffres d'avant sont-ils
 * les chiffres d'après. Le reste — colonnes, index, vues — n'a d'intérêt que
 * s'il ne coûte rien aux données.
 *
 * On ne recopie PAS le fichier de production : il est scellé à son dossier et
 * refuserait de s'ouvrir ailleurs, ce qui est précisément le comportement
 * voulu. On passe par une sauvegarde, qui est faite pour voyager — et cela
 * éprouve du même coup le chemin qu'empruntera un vrai sinistre.
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { base, fermerBase, ouvrirBase, VERSION_SCHEMA } from '../src/main/db'
import { restaurerEnUrgence, sauvegardesDisponibles } from '../src/main/secours'
import { controlerSauvegarde } from '../src/main/services/configuration'

const SAUVEGARDES =
  process.env.PHARMINA_SAUVEGARDES ?? 'C:/Users/Lenovo/AppData/Roaming/PHARMINA/sauvegardes'
const ESSAI = 'C:/Users/Lenovo/AppData/Local/Temp/migration-009'

function un(sql: string): number {
  try {
    return Number((base().prepare(sql).get() as Record<string, unknown>)?.n ?? 0)
  } catch {
    return -1
  }
}

async function principal(): Promise<void> {
  await app.whenReady()

  const disponibles = sauvegardesDisponibles(SAUVEGARDES)
  console.log(`  sauvegardes trouvées : ${disponibles.length}`)
  if (!disponibles.length) {
    console.log('  aucune sauvegarde de production : rien à éprouver ici.')
    app.exit(0)
    return
  }

  const source = disponibles.find((s) => controlerSauvegarde(s.fichier).valide)
  if (!source) {
    console.log('  PROBLÈME : aucune sauvegarde de production n’est relisible.')
    app.exit(1)
    return
  }

  const controle = controlerSauvegarde(source.fichier)
  console.log(
    `  sauvegarde retenue : ${source.fichier.split(/[\\/]/).pop()}` +
      ` (schéma ${controle.version}, ${Math.round(statSync(source.fichier).size / 1024)} Ko)`
  )

  rmSync(ESSAI, { recursive: true, force: true })
  mkdirSync(ESSAI, { recursive: true })
  const cible = join(ESSAI, 'pharmina.db')

  // C'est ici que les migrations manquantes s'appliquent : la sauvegarde porte
  // le schéma d'hier, le logiciel ouvre celui d'aujourd'hui.
  restaurerEnUrgence(source.fichier, cible)
  ouvrirBase(cible)

  const version = (base().prepare('SELECT MAX(version) n FROM schema_migrations').get() as { n: number }).n
  console.log(`  schéma après ouverture : ${version} (cible ${VERSION_SCHEMA})`)

  const chiffres = {
    produits: un('SELECT COUNT(*) n FROM produits'),
    ventes: un("SELECT COUNT(*) n FROM ventes WHERE statut <> 'annulee'"),
    chiffreAffaires: un("SELECT COALESCE(SUM(total),0) n FROM ventes WHERE statut <> 'annulee'"),
    lignes: un('SELECT COUNT(*) n FROM vente_lignes'),
    stock: un('SELECT COALESCE(SUM(quantite_restante),0) n FROM lots'),
    clients: un('SELECT COUNT(*) n FROM clients'),
    mouvements: un('SELECT COUNT(*) n FROM mouvements_stock')
  }
  console.log('  chiffres :', JSON.stringify(chiffres))

  const integrite = (base().prepare('PRAGMA integrity_check').get() as { integrity_check: string })
    .integrity_check
  const cles = base().prepare('PRAGMA foreign_key_check').all().length
  console.log(`  intégrité : ${integrite} | violations de clés : ${cles}`)

  // La colonne normalisée doit être remplie partout où le principe actif l'est :
  // c'est tout l'objet du rattrapage.
  const manquants = un(
    `SELECT COUNT(*) n FROM produits
     WHERE principe_actif IS NOT NULL AND TRIM(principe_actif) <> ''
       AND (principe_actif_norme IS NULL OR principe_actif_norme = '')`
  )
  console.log(`  fiches avec molécule mais sans forme normalisée : ${manquants}`)

  const accentues = base()
    .prepare(
      `SELECT principe_actif, principe_actif_norme FROM produits
       WHERE principe_actif LIKE '%é%' OR principe_actif LIKE '%É%' LIMIT 3`
    )
    .all()
  console.log('  échantillon accentué :', JSON.stringify(accentues))

  const groupes = un(
    `SELECT COUNT(*) n FROM (
       SELECT principe_actif_norme FROM produits
       WHERE principe_actif_norme IS NOT NULL AND archived_at IS NULL
       GROUP BY principe_actif_norme HAVING COUNT(*) > 1)`
  )
  console.log(`  molécules portées par plusieurs produits — donc des équivalents : ${groupes}`)

  // La vue du comptoir doit répondre : c'est elle qu'interroge la fiche vivante.
  const vues = un('SELECT COUNT(*) n FROM v_produit_etat')
  console.log(`  fiches lisibles par le comptoir : ${vues}`)

  fermerBase()

  const sain =
    integrite === 'ok' &&
    cles === 0 &&
    manquants === 0 &&
    version === VERSION_SCHEMA &&
    vues === chiffres.produits &&
    chiffres.produits > 0

  // On laisse le dossier d'essai en place seulement s'il y a quelque chose à
  // regarder ; sinon on ne salit pas le disque.
  if (sain && existsSync(ESSAI)) {
    console.log(`  (${readdirSync(ESSAI).length} fichiers dans ${ESSAI})`)
    rmSync(ESSAI, { recursive: true, force: true })
  }

  console.log(sain ? '\n  MIGRATION SAINE SUR LES DONNÉES RÉELLES' : '\n  PROBLÈME')
  app.exit(sain ? 0 : 1)
}

principal().catch((erreur) => {
  console.log('ÉCHEC :', (erreur as Error).message)
  app.exit(1)
})
