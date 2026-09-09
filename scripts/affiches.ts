/**
 * Les affiches d'ouverture, à poser avant la vidéo au montage.
 *
 *     npm run affiches
 *
 * Sortie, dans « affiches/ » :
 *
 *   1-large.png       1536 × 864   — la promesse
 *   1-vertical.png     720 × 1280
 *   2-large.png       1536 × 864   — le logiciel, en vrai
 *   2-vertical.png     720 × 1280
 *
 * POURQUOI DEUX AFFICHES ET NON UNE
 *
 * La première annonce : une phrase, rien d'autre à lire. La seconde prouve —
 * on voit le logiciel. Trois secondes chacune au montage suffisent ; au-delà,
 * on fait attendre pour rien quelqu'un qui allait regarder.
 *
 * POURQUOI DEUX FORMATS
 *
 * La vidéo existe en large et en vertical. Une affiche large posée devant une
 * vidéo verticale laisse deux bandes noires, et l'inverse coupe tout.
 *
 * LE STYLE
 *
 * Celui du logiciel : feuille blanche, bandeau vert, texte noir, filets fins,
 * texte calé à gauche. Ni dégradé, ni halo, ni ombre portée — une affiche en
 * couleurs fondues annoncerait autre chose que ce qui s'installe ensuite.
 *
 * POURQUOI UNE TOILE, ET NON UNE PAGE PHOTOGRAPHIÉE
 *
 * Une fenêtre ne peut pas dépasser l'écran : 720 × 1280 est impossible sur un
 * écran qui fait 1536 × 864, et Windows la ramènerait à la hauteur
 * disponible. Une toile n'a pas cette limite.
 *
 * La capture du logiciel, elle, est prise sur la vraie fenêtre : ce qu'on
 * montre est ce qui sera livré, sans maquette redessinée à côté.
 */
import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { fermerBase, ouvrirBase } from '../src/main/db'
import { chemins, enregistrerCanaux } from '../src/main/ipc'
import * as licence from '../src/main/services/licence'
import { garnirOfficine, licencePremiumPour } from './demo-officine'

const APP_LARGEUR = 1536
const APP_HAUTEUR = 820

const dossierSortie = join(process.cwd(), 'affiches')
const CLE_PRIVEE = join(process.cwd(), 'licence-privee.pem')

const EDITEUR = 'GLOBALTECH BUSINESS TD · N’Djaména'
const TELEPHONES = '+235 97 69 11 12 · 69 18 67 66'

const dossierTravail = mkdtempSync(join(tmpdir(), 'pharmina-affiches-'))
const cheminBase = join(dossierTravail, 'donnees', 'pharmina.db')

app.on('window-all-closed', () => {
  /* on décide nous-mêmes quand rendre la main */
})

const attendre = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function principal(): Promise<void> {
  if (!existsSync(CLE_PRIVEE)) {
    console.log('\n  Clé de licence introuvable : le bandeau de démonstration')
    console.log('  resterait affiché sur la capture.\n')
    process.exit(1)
  }

  await app.whenReady()
  Menu.setApplicationMenu(null)

  licence.definirDossierLicence(join(dossierTravail, 'donnees'))
  ouvrirBase(cheminBase)
  garnirOfficine()

  const etat = licence.etat(0)
  licence.activer(licencePremiumPour(etat.codeInstallation, CLE_PRIVEE), 1)

  chemins(cheminBase, join(dossierTravail, 'sauvegardes'))
  enregistrerCanaux()

  const scene = new BrowserWindow({
    width: APP_LARGEUR,
    height: APP_HAUTEUR,
    useContentSize: true,
    show: true,
    title: 'PHARMINA',
    frame: false,
    backgroundColor: '#eef2f3',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Cloison etanche : sans elle, la fenetre herite du stockage local du
      // poste, theme compris, et l'affiche sort dans une autre couleur que le
      // logiciel livre.
      partition: 'vitrine',
      backgroundThrottling: false
    }
  })
  await scene.loadFile(join(__dirname, '../renderer/index.html'))
  scene.moveTop()
  scene.focus()
  await attendre(1800)

  const js = (code: string): Promise<unknown> => scene.webContents.executeJavaScript(code)

  await js(`
    (async () => {
      const poser = (sel, val) => {
        const c = document.querySelector(sel)
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(c, val)
        c.dispatchEvent(new Event('input', { bubbles: true }))
      }
      poser('input[name=identifiant], input[autocomplete=username]', 'tchadien')
      poser('input[type=password]', 'Officine2026')
      await new Promise((r) => setTimeout(r, 250))
      document.querySelector('form button[type=submit], form .bouton.principal')?.click()
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 100))
        if (document.querySelector('.indicateurs')) break
      }
      return true
    })()`)
  await attendre(1200)

  // La capture est rendue en pixels physiques : sur un écran à 125 %, une
  // fenêtre de 1536 de large en donne 1920. C'est tant mieux — l'écran posé
  // sur l'affiche est réduit, donc net.
  const image = await scene.webContents.capturePage()
  const capture = image.toDataURL()
  const taille = image.getSize()
  console.log(`  capture du logiciel : ${taille.width} × ${taille.height}`)

  // --- L'atelier ------------------------------------------------------------
  const pageAtelier = join(dossierTravail, 'atelier.html')
  writeFileSync(pageAtelier, '<!doctype html><meta charset="utf-8"><body></body>', 'utf8')

  const atelier = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false }
  })
  await atelier.loadFile(pageAtelier)

  mkdirSync(dossierSortie, { recursive: true })

  const ecrites: string[] = []
  ipcMain.on('affiche', (_e, nom: string, donnees: string) => {
    writeFileSync(join(dossierSortie, nom), Buffer.from(donnees.split(',')[1]!, 'base64'))
    ecrites.push(nom)
  })

  const fini = new Promise<void>((resoudre) => {
    ipcMain.once('affiches-finies', () => resoudre())
  })

  await atelier.webContents.executeJavaScript(dessin(capture, taille.width, taille.height))
  await fini
  await attendre(300)

  console.log('')
  for (const nom of ecrites) console.log(`  ${join(dossierSortie, nom)}`)
  console.log('')

  scene.destroy()
  atelier.destroy()
  fermerBase()
  rmSync(dossierTravail, { recursive: true, force: true, maxRetries: 20, retryDelay: 120 })
  app.exit(0)
}

/**
 * Le dessin des quatre affiches, dans la fenêtre masquée.
 *
 * Aucune apostrophe inversée ici : ce texte est livré dans un gabarit, et une
 * seule suffirait à couper le script en silence.
 */
function dessin(capture: string, sourceLargeur: number, sourceHauteur: number): string {
  return `
    (async () => {
      const { ipcRenderer } = require('electron')

      const ecran = new Image()
      ecran.src = ${JSON.stringify(capture)}
      await ecran.decode()

      const SL = ${sourceLargeur}, SH = ${sourceHauteur}

      // Les couleurs sont celles du logiciel, pas d'autres : une affiche qui
      // annonce un vert et ouvre sur un autre a l'air d'un montage.
      const VERT = '#0f7a62'
      const NOIR = '#16211d'
      const GRIS = '#55625d'
      const FILET = '#ccd3d9'
      const POLICE = '"Segoe UI", system-ui, sans-serif'

      const RUBRIQUES = [
        'Ventes au comptoir',
        'Stock et inventaire',
        'Caisse et dépenses',
        'Clients et crédit',
        'Péremptions',
        'Bilan du mois'
      ]

      const toile = (largeur, hauteur) => {
        const t = document.createElement('canvas')
        t.width = largeur
        t.height = hauteur
        return t
      }

      const texte = (p, mot, x, y, taille, poids, couleur, espace, aligne) => {
        p.font = poids + ' ' + taille + 'px ' + POLICE
        p.letterSpacing = (espace || 0) + 'px'
        p.textAlign = aligne || 'left'
        p.fillStyle = couleur
        p.fillText(mot, x, y)
        p.letterSpacing = '0px'
      }

      /**
       * La feuille : blanche, avec le bandeau du logiciel en haut.
       *
       * Le logiciel est blanc a filets fins. Une affiche en couleurs fondues
       * annoncerait autre chose que ce qu'on installe.
       */
      const feuille = (p, l, h, bandeau) => {
        p.fillStyle = '#ffffff'
        p.fillRect(0, 0, l, h)
        p.fillStyle = VERT
        p.fillRect(0, 0, l, bandeau)
        texte(p, 'PHARMINA', 56, bandeau / 2 + 8, 23, '800', '#ffffff', -0.5)
        texte(
          p, 'Gestion de pharmacie', l - 56, bandeau / 2 + 7, 17, '400',
          'rgba(255, 255, 255, 0.74)', 0, 'right'
        )
      }

      /**
       * Le pied : un filet, l'editeur, les numeros.
       *
       * Sur une affiche verticale les deux ne tiennent pas cote a cote — ils
       * se chevauchaient au milieu du numero. On les empile.
       */
      const pied = (p, l, y, marge, empile) => {
        p.fillStyle = FILET
        p.fillRect(marge, y, l - marge * 2, 1)
        texte(p, ${JSON.stringify(EDITEUR)}, marge, y + 34, 20, '600', NOIR)
        if (empile) texte(p, ${JSON.stringify(TELEPHONES)}, marge, y + 66, 20, '400', GRIS)
        else texte(p, ${JSON.stringify(TELEPHONES)}, l - marge, y + 34, 20, '400', GRIS, 0, 'right')
      }

      /** L'ecran du logiciel, borde d'un filet comme les panneaux du logiciel. */
      const poserEcran = (p, cadre, x, y, l, h) => {
        p.drawImage(ecran, cadre.x, cadre.y, cadre.l, cadre.h, x, y, l, h)
        p.strokeStyle = FILET
        p.lineWidth = 1
        p.strokeRect(x + 0.5, y + 0.5, l - 1, h - 1)
      }

      /** Les rubriques, puce carree verte : sobre, et lisible de loin. */
      const liste = (p, x, y, pas, taille) => {
        let courant = y
        for (const rubrique of RUBRIQUES) {
          p.fillStyle = VERT
          p.fillRect(x, courant - taille * 0.62, 7, 7)
          texte(p, rubrique, x + 20, courant, taille, '400', NOIR)
          courant += pas
        }
      }

      const rendre = (nom, t) => ipcRenderer.send('affiche', nom, t.toDataURL('image/png'))

      // ================= Affiche 1 : la promesse =================
      {
        const t = toile(1536, 864), p = t.getContext('2d')
        feuille(p, 1536, 864, 56)
        texte(p, 'Le logiciel qui tient', 104, 272, 68, '700', NOIR, -1.5)
        texte(p, 'votre pharmacie', 104, 348, 68, '700', NOIR, -1.5)
        p.fillStyle = VERT
        p.fillRect(104, 388, 104, 4)
        texte(
          p, 'Une officine se tient à la boîte près, pas au cahier près.',
          104, 458, 27, '400', GRIS
        )
        liste(p, 104, 524, 40, 23)
        pied(p, 1536, 762, 104)
        rendre('1-large.png', t)
      }

      {
        const t = toile(720, 1280), p = t.getContext('2d')
        feuille(p, 720, 1280, 56)
        texte(p, 'Le logiciel', 56, 364, 62, '700', NOIR, -1.5)
        texte(p, 'qui tient votre', 56, 434, 62, '700', NOIR, -1.5)
        texte(p, 'pharmacie', 56, 504, 62, '700', NOIR, -1.5)
        p.fillStyle = VERT
        p.fillRect(56, 544, 96, 4)
        texte(p, 'Une officine se tient à la boîte', 56, 612, 25, '400', GRIS)
        texte(p, 'près, pas au cahier près.', 56, 646, 25, '400', GRIS)
        liste(p, 56, 724, 46, 24)
        pied(p, 720, 1030, 56, true)
        rendre('1-vertical.png', t)
      }

      // ================= Affiche 2 : le logiciel =================
      {
        const t = toile(1536, 864), p = t.getContext('2d')
        feuille(p, 1536, 864, 56)
        texte(p, 'Tout ce qui compte, en un écran', 104, 152, 46, '700', NOIR, -1)
        texte(
          p, 'Ce qui manque, ce qui périme, ce qui a été vendu.',
          104, 194, 24, '400', GRIS
        )
        const l = 940, h = Math.round((l * SH) / SL)
        poserEcran(p, { x: 0, y: 0, l: SL, h: SH }, 104, 244, l, h)
        liste(p, 1108, 306, 48, 22)
        pied(p, 1536, 762, 104)
        rendre('2-large.png', t)
      }

      {
        const t = toile(720, 1280), p = t.getContext('2d')
        feuille(p, 720, 1280, 56)
        texte(p, 'Tout ce qui compte,', 56, 168, 44, '700', NOIR, -1)
        texte(p, 'en un écran', 56, 222, 44, '700', NOIR, -1)
        texte(p, 'Ce qui manque, ce qui périme,', 56, 278, 23, '400', GRIS)
        texte(p, 'ce qui a été vendu.', 56, 310, 23, '400', GRIS)
        const l = 640, h = Math.round((l * SH) / SL)
        poserEcran(p, { x: 0, y: 0, l: SL, h: SH }, 40, 362, l, h)
        liste(p, 56, 790, 50, 24)
        pied(p, 720, 1076, 56, true)
        rendre('2-vertical.png', t)
      }

      ipcRenderer.send('affiches-finies')
      return true
    })()`
}

principal().catch((erreur) => {
  console.error('ÉCHEC :', (erreur as Error).message)
  app.exit(1)
})
