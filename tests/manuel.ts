/**
 * Produit le guide d'utilisation en PDF.
 *
 * Le PDF n'est pas écrit à part : il est imprimé depuis l'écran d'aide du
 * logiciel réel. Le document remis au pharmacien et l'aide qu'il consulte à
 * l'écran ne peuvent donc jamais diverger, et une correction se fait une seule
 * fois.
 *
 * Sortie : Manuel-PHARMINA.pdf, à la racine du dépôt.
 */
import { app, BrowserWindow } from 'electron'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { fermerBase, ouvrirBase } from '../src/main/db'
import { chemins, enregistrerCanaux } from '../src/main/ipc'
import * as configuration from '../src/main/services/configuration'

const dossierTravail = mkdtempSync(join(tmpdir(), 'pharmina-manuel-'))
const cheminBase = join(dossierTravail, 'donnees', 'pharmina.db')
const sortie = join(process.cwd(), 'Manuel-PHARMINA.pdf')

async function produire(): Promise<void> {
  ouvrirBase(cheminBase)

  // Une officine minimale : le guide n'a besoin d'aucune donnée, seulement
  // d'une session ouverte pour que l'écran s'affiche.
  configuration.configurerPharmacie({
    pharmacie: {
      nom: 'Pharmacie',
      devise: 'XOF',
      deviseSymbole: 'FCFA',
      deviseDecimales: 0
    },
    administrateur: { nomComplet: 'Guide', identifiant: 'guide', motDePasse: 'Officine2026' }
  })

  chemins(cheminBase, join(dossierTravail, 'sauvegardes'))
  enregistrerCanaux()

  const fenetre = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  await fenetre.loadFile(join(__dirname, '../renderer/index.html'))
  await new Promise((r) => setTimeout(r, 1600))

  const saisir = `
    (selecteur, valeur) => {
      const champ = document.querySelector(selecteur)
      if (!champ) return false
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(champ, valeur)
      champ.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    }`

  await fenetre.webContents.executeJavaScript(
    `(${saisir})('input[autocomplete=username]', 'guide')`
  )
  await fenetre.webContents.executeJavaScript(
    `(${saisir})('input[autocomplete=current-password]', 'Officine2026')`
  )
  await fenetre.webContents.executeJavaScript(`
    (() => {
      const b = Array.from(document.querySelectorAll('button'))
        .find((e) => e.textContent && e.textContent.trim().startsWith('Se connecter'))
      if (b) b.click()
      return !!b
    })()`)
  await new Promise((r) => setTimeout(r, 2200))

  const ouvert = await fenetre.webContents.executeJavaScript(`
    (() => {
      const b = Array.from(document.querySelectorAll('.nav-lien'))
        .find((e) => e.textContent && e.textContent.trim().startsWith('Guide'))
      if (b) { b.click(); return true }
      return false
    })()`)

  if (!ouvert) throw new Error('Le module Guide est introuvable dans la navigation.')
  await new Promise((r) => setTimeout(r, 1200))

  const sections = (await fenetre.webContents.executeJavaScript(
    `document.querySelectorAll('.guide-section').length`
  )) as number

  if (sections < 10) throw new Error(`Guide incomplet : ${sections} sections seulement.`)

  // On mesure ce que le PAPIER verra, pas ce que l'écran affiche : la coque du
  // logiciel tient dans une hauteur d'écran, et un guide qui s'arrête à la
  // première page sortirait sans qu'on s'en aperçoive.
  const debogueur = fenetre.webContents.debugger
  debogueur.attach('1.3')
  await debogueur.sendCommand('Emulation.setEmulatedMedia', { media: 'print' })
  await new Promise((r) => setTimeout(r, 400))

  const mesure = (await fenetre.webContents.executeJavaScript(`
    (() => {
      const contenus = Array.from(document.querySelectorAll('.guide-contenu'))
      const visibles = contenus.filter((c) => getComputedStyle(c).display !== 'none').length
      const dec = (sel) => {
        const e = document.querySelector(sel)
        if (!e) return sel + ': absent'
        const s = getComputedStyle(e)
        return sel + ': ' + s.display + ' h=' + s.height + ' of=' + s.overflow + ' sh=' + e.scrollHeight
      }
      return {
        hauteurDocument: document.documentElement.scrollHeight,
        hauteurCorps: document.body.scrollHeight,
        sectionsVisibles: visibles,
        surSections: contenus.length,
        pile: [dec('body'), dec('#racine'), dec('.application'), dec('.zone-travail'), dec('.contenu'), dec('.guide')]
      }
    })()`)) as {
    hauteurDocument: number
    hauteurCorps: number
    sectionsVisibles: number
    surSections: number
    pile: string[]
  }

  console.log(`  a l'impression : hauteur ${mesure.hauteurDocument}, sections ${mesure.sectionsVisibles}/${mesure.surSections}`)
  for (const ligne of mesure.pile) console.log(`    ${ligne}`)
  await debogueur.sendCommand('Emulation.setEmulatedMedia', { media: '' })
  debogueur.detach()

  if (mesure.sectionsVisibles < mesure.surSections) {
    throw new Error(
      `Sur papier, ${mesure.sectionsVisibles} sections sur ${mesure.surSections} seulement sont dépliées.`
    )
  }

  const pdf = await fenetre.webContents.printToPDF({
    pageSize: 'A4',
    printBackground: false,
    margins: { top: 0.6, bottom: 0.6, left: 0.7, right: 0.7 },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate:
      '<div style="width:100%;font-size:8px;color:#777;padding:0 14mm;' +
      'display:flex;justify-content:space-between;">' +
      '<span>PHARMINA — Guide d’utilisation · GLOBALTECH BUSINESS TD</span>' +
      '<span class="pageNumber"></span></div>'
  })

  writeFileSync(sortie, pdf)
  console.log(`  ${sections} sections`)
  console.log(`  ${sortie} — ${Math.round(pdf.length / 1024)} Ko`)

  fenetre.destroy()
  fermerBase()
}

app.setName('PHARMINA')

app.whenReady().then(async () => {
  try {
    await produire()
    // On ne force pas la suppression du dossier temporaire : le systeme le
    // videra. Echouer ici apres avoir produit le PDF serait absurde.
    try {
      rmSync(dossierTravail, { recursive: true, force: true })
    } catch {
      /* fichiers encore verrouilles */
    }
    app.exit(0)
  } catch (erreur) {
    console.error(`ECHEC : ${(erreur as Error).message}`)
    try {
      rmSync(dossierTravail, { recursive: true, force: true })
    } catch {
      /* fichiers encore verrouilles */
    }
    app.exit(1)
  }
})
