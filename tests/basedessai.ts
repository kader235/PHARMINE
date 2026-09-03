/**
 * Monte une base d'essai portant les donnees reelles de l'officine.
 *
 * POURQUOI
 *
 * Tester une nouveaute sur la base de production, c'est parier. La restaurer
 * ensuite est possible, mais on ne devrait pas avoir a en arriver la : une
 * copie separee coute trente secondes et ne risque rien.
 *
 * On part d'une SAUVEGARDE, pas du fichier de production : une sauvegarde est
 * faite pour voyager, et c'est le seul chemin qui rescelle correctement la base
 * a son nouvel emplacement.
 */
import { app } from 'electron'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { base, fermerBase, ouvrirBase } from '../src/main/db'
import { restaurerEnUrgence, sauvegardesDisponibles } from '../src/main/secours'
import { controlerSauvegarde } from '../src/main/services/configuration'

const SAUVEGARDES =
  process.env.PHARMINA_SAUVEGARDES ?? 'C:/Users/Lenovo/AppData/Roaming/PHARMINA/sauvegardes'
const DESTINATION = process.env.PHARMINA_ESSAI ?? 'C:/Users/Lenovo/PHARMINA-essai'

async function principal(): Promise<void> {
  await app.whenReady()

  const source = sauvegardesDisponibles(SAUVEGARDES).find((s) => controlerSauvegarde(s.fichier).valide)
  if (!source) {
    console.log('Aucune sauvegarde relisible : rien a copier.')
    app.exit(1)
    return
  }

  if (existsSync(DESTINATION)) rmSync(DESTINATION, { recursive: true, force: true })
  mkdirSync(join(DESTINATION, 'donnees'), { recursive: true })

  const cible = join(DESTINATION, 'donnees', 'pharmina.db')
  restaurerEnUrgence(source.fichier, cible)
  ouvrirBase(cible)

  const compte = (sql: string): number =>
    Number((base().prepare(sql).get() as Record<string, unknown>).n)

  console.log('')
  console.log(`  Base d'essai prete : ${cible}`)
  console.log(`  Depuis : ${source.fichier.split(/[\/]/).pop()}`)
  console.log(
    `  Contenu : ${compte('SELECT COUNT(*) n FROM produits')} produits, ` +
      `${compte("SELECT COUNT(*) n FROM ventes WHERE statut <> 'annulee'")} ventes, ` +
      `${compte('SELECT COUNT(*) n FROM clients')} clients`
  )
  console.log('')
  console.log('  Pour la lancer :')
  console.log(`    PHARMINA_BASE="${cible}" npm run dev`)
  console.log('')

  fermerBase()
  app.exit(0)
}

principal().catch((erreur) => {
  console.log('ECHEC :', (erreur as Error).message)
  app.exit(1)
})
