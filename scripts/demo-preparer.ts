/**
 * Prépare une officine de démonstration, prête à montrer.
 *
 *     npm run demo:preparer
 *     PHARMINA_BASE="…/PHARMINA-demo/donnees/pharmina.db" npm run demo:ouvrir
 *
 * POURQUOI SÉPARER LA PRÉPARATION DE L'OUVERTURE
 *
 * L'application ouvre la base et la garde. On ne peut donc pas la garnir
 * pendant qu'elle tourne : il faut poser le décor, refermer, puis ouvrir.
 *
 * La licence est activée en Premium : sans elle, le bandeau « DÉMONSTRATION —
 * 2 ventes encore possibles » s'affiche en bas de chaque écran, et l'on
 * montrerait un logiciel bridé à un prospect. Le Premium ouvre aussi le bilan
 * mensuel, qui est ce qu'on veut montrer en dernier.
 *
 * Rien de tout cela ne touche la base de production : le dossier est distinct.
 */
import { app } from 'electron'
import { existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { fermerBase, ouvrirBase } from '../src/main/db'
import * as licence from '../src/main/services/licence'
import { garnirOfficine, licencePremiumPour } from './demo-officine'

const DOSSIER = process.env.PHARMINA_DEMO ?? join(process.env.USERPROFILE ?? '.', 'PHARMINA-demo')
const cheminBase = join(DOSSIER, 'donnees', 'pharmina.db')
const CLE_PRIVEE = join(process.cwd(), 'licence-privee.pem')

app.whenReady().then(() => {
  if (!existsSync(CLE_PRIVEE)) {
    console.log('\n  Clé de licence introuvable : la démonstration resterait bridée.\n')
    app.exit(1)
    return
  }

  // On repart d'un décor neuf : une démonstration qui traîne les essais de la
  // veille donne une mauvaise impression.
  rmSync(DOSSIER, { recursive: true, force: true })

  licence.definirDossierLicence(dirname(cheminBase))
  ouvrirBase(cheminBase)
  garnirOfficine()

  const etat = licence.etat(0)
  licence.activer(licencePremiumPour(etat.codeInstallation, CLE_PRIVEE), 1)
  fermerBase()

  console.log('')
  console.log('  Officine de démonstration prête — formule Premium activée.')
  console.log(`  ${cheminBase}`)
  console.log('')
  console.log('  Identifiant : kader')
  console.log('  Mot de passe : Officine2026')
  console.log('')
  app.exit(0)
})
