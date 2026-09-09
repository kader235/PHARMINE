/**
 * Enregistre une vidéo de démonstration de PHARMINA.
 *
 *     npm run video
 *
 * Sortie : Video-PHARMINA.mp4, à la racine du dépôt. H.264, prêt pour
 * WhatsApp — c'est par là que la publicité circule au Tchad.
 *
 * COMMENT C'EST FILMÉ
 *
 * Deux fenêtres. La première est l'application, visible, en 1600 × 900 : c'est
 * la scène. La seconde est masquée et ne fait qu'enregistrer, pour ne pas
 * perturber ce qu'elle filme.
 *
 * On capture la FENÊTRE, pas l'écran : ce qui passe par-dessus pendant
 * l'enregistrement a moins de chances d'apparaître, et rien de la machine de
 * l'éditeur ne se retrouve dans une vidéo publique.
 *
 * DEUX PIÈGES RENCONTRÉS, POUR QUI REPRENDRA CE FICHIER
 *
 *   — `navigator.mediaDevices` n'existe PAS sur une URL « data: » : ce n'est
 *     pas un contexte sécurisé. L'enregistreur se charge donc depuis un
 *     fichier ;
 *   — détruire une fenêtre déclenche `window-all-closed`, dont le
 *     comportement par défaut ferme l'application. On rend la main nous-mêmes.
 *
 * CE QUE CETTE VIDÉO N'A PAS
 *
 * Ni voix, ni musique : Electron ne sait qu'enregistrer l'image. Les cartons
 * portent donc le discours, et le rythme est calculé pour qu'on ait le temps
 * de les lire sans s'ennuyer.
 */
import { app, BrowserWindow, Menu, desktopCapturer, ipcMain } from 'electron'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { fermerBase, ouvrirBase } from '../src/main/db'
import { chemins, enregistrerCanaux } from '../src/main/ipc'
import * as licence from '../src/main/services/licence'
import { garnirOfficine, licencePremiumPour } from './demo-officine'

const LARGEUR = 1600
const HAUTEUR = 900
const sortie = join(process.cwd(), 'Video-PHARMINA.mp4')
const CLE_PRIVEE = join(process.cwd(), 'licence-privee.pem')

const dossierTravail = mkdtempSync(join(tmpdir(), 'pharmina-video-'))
const cheminBase = join(dossierTravail, 'donnees', 'pharmina.db')

app.on('window-all-closed', () => {
  /* on décide nous-mêmes quand rendre la main */
})

const attendre = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Les cartons.
 *
 * Un enregistrement d'écran brut n'est pas une publicité : le prospect voit
 * des clics sans savoir ce qu'on lui montre. Chaque scène est donc annoncée
 * par une phrase, en bas de l'image, assez longtemps pour être lue.
 */
const HABILLAGE = `
  #pub-carton {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483647;
    padding: 26px 48px 30px;
    background: linear-gradient(transparent, rgba(6, 40, 32, 0.92) 38%);
    color: #fff; pointer-events: none;
    font: 500 27px/1.35 "Segoe UI", system-ui, sans-serif;
    opacity: 0; transition: opacity 0.45s ease;
  }
  #pub-carton.vu { opacity: 1; }
  #pub-carton b { display: block; font-weight: 700; font-size: 33px; margin-bottom: 5px; }
  #pub-carton span { opacity: 0.86; font-size: 23px; }

  #pub-titre {
    position: fixed; inset: 0; z-index: 2147483647;
    background: #0d8a70; color: #fff;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 18px; pointer-events: none;
    font-family: "Segoe UI", system-ui, sans-serif;
    opacity: 0; transition: opacity 0.6s ease;
  }
  #pub-titre.vu { opacity: 1; }
  #pub-titre .marque { font-size: 78px; font-weight: 800; letter-spacing: -2px; }
  #pub-titre .phrase { font-size: 30px; opacity: 0.9; text-align: center; line-height: 1.4; }
  #pub-titre .pied { font-size: 21px; opacity: 0.75; margin-top: 22px; }
`

async function principal(): Promise<void> {
  if (!existsSync(CLE_PRIVEE)) {
    console.log('\n  La clé de licence est introuvable : le bandeau de démonstration')
    console.log('  resterait affiché pendant toute la vidéo.\n')
    process.exit(1)
  }

  await app.whenReady()

  // Le menu d'Electron — « File Edit View Window » — se retrouvait en haut de
  // la video. Rien ne trahit plus surement une demonstration bricolee.
  Menu.setApplicationMenu(null)

  licence.definirDossierLicence(join(dossierTravail, 'donnees'))
  ouvrirBase(cheminBase)
  garnirOfficine()

  const etat = licence.etat(0)
  licence.activer(licencePremiumPour(etat.codeInstallation, CLE_PRIVEE), 1)
  console.log(`  poste activé en Premium : ${etat.codeInstallation}`)

  chemins(cheminBase, join(dossierTravail, 'sauvegardes'))
  enregistrerCanaux()

  // --- La scène -------------------------------------------------------------
  const scene = new BrowserWindow({
    width: LARGEUR,
    height: HAUTEUR,
    show: true,
    title: 'PHARMINA',
    // Sans cadre : la capture ne contient que l'application, pas la barre de
    // titre ni les bordures de Windows.
    frame: false,
    backgroundColor: '#eef2f3',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  })
  await scene.loadFile(join(__dirname, '../renderer/index.html'))
  await attendre(1800)

  const js = (code: string): Promise<unknown> => scene.webContents.executeJavaScript(code)

  // Connexion, puis thème Émeraude : c'est le visage commercial.
  await js(`
    (async () => {
      const poser = (sel, val) => {
        const c = document.querySelector(sel)
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(c, val)
        c.dispatchEvent(new Event('input', { bubbles: true }))
      }
      poser('input[name=identifiant], input[autocomplete=username]', 'kader')
      poser('input[type=password]', 'Officine2026')
      await new Promise((r) => setTimeout(r, 250))
      document.querySelector('form button[type=submit], form .bouton.principal')?.click()
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 100))
        if (document.querySelector('.nav-lien')) break
      }
      // Le vert est desormais le theme par defaut : rien a poser.

      const style = document.createElement('style')
      style.textContent = ${JSON.stringify(HABILLAGE)}
      document.head.appendChild(style)

      const carton = document.createElement('div')
      carton.id = 'pub-carton'
      document.body.appendChild(carton)

      const titre = document.createElement('div')
      titre.id = 'pub-titre'
      titre.innerHTML =
        '<div class="marque">PHARMINA</div>' +
        '<div class="phrase">Le logiciel qui tient votre pharmacie</div>' +
        '<div class="pied">Ventes · Stock · Caisse · Clients</div>'
      document.body.appendChild(titre)

      window.__carton = (fort, doux) => {
        carton.innerHTML = '<b>' + fort + '</b>' + (doux ? '<span>' + doux + '</span>' : '')
        carton.classList.add('vu')
      }
      window.__cacherCarton = () => carton.classList.remove('vu')
      window.__titre = (html) => {
        if (html) titre.innerHTML = html
        titre.classList.add('vu')
      }
      window.__cacherTitre = () => titre.classList.remove('vu')
      return true
    })()`)

  // --- L'enregistreur -------------------------------------------------------
  const pageEnregistreur = join(dossierTravail, 'enregistreur.html')
  writeFileSync(pageEnregistreur, '<!doctype html><meta charset="utf-8"><body></body>', 'utf8')

  const enregistreur = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  })
  await enregistreur.loadFile(pageEnregistreur)

  const sources = await desktopCapturer.getSources({ types: ['window'] })
  const cible = sources.find((s) => s.name === 'PHARMINA')
  if (!cible) {
    console.log('  La fenêtre de PHARMINA est introuvable parmi les sources.')
    app.exit(1)
    return
  }

  const fini = new Promise<void>((resoudre) => {
    ipcMain.once('video-prete', (_e, octets: number[]) => {
      writeFileSync(sortie, Buffer.from(octets))
      console.log(`  ${sortie} — ${Math.round(octets.length / 1024 / 1024 * 10) / 10} Mo`)
      resoudre()
    })
  })

  await enregistreur.webContents.executeJavaScript(`
    (async () => {
      const { ipcRenderer } = require('electron')
      const flux = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: ${JSON.stringify(cible.id)},
            minWidth: ${LARGEUR}, maxWidth: ${LARGEUR},
            minHeight: ${HAUTEUR}, maxHeight: ${HAUTEUR},
            maxFrameRate: 30
          }
        }
      })
      const morceaux = []
      const enr = new MediaRecorder(flux, {
        mimeType: 'video/mp4;codecs=avc1',
        videoBitsPerSecond: 6000000
      })
      enr.ondataavailable = (e) => { if (e.data.size) morceaux.push(e.data) }
      enr.onstop = async () => {
        const tampon = await new Blob(morceaux, { type: 'video/mp4' }).arrayBuffer()
        ipcRenderer.send('video-prete', Array.from(new Uint8Array(tampon)))
      }
      enr.start(250)
      window.__arreter = () => enr.stop()
      return true
    })()`)

  console.log('  enregistrement en cours — ne touchez pas à la machine…')

  await jouerLaVisite(js)

  await enregistreur.webContents.executeJavaScript('window.__arreter()')
  await fini

  scene.destroy()
  enregistreur.destroy()
  fermerBase()
  rmSync(dossierTravail, { recursive: true, force: true, maxRetries: 20, retryDelay: 120 })
  app.exit(0)
}

/** Le déroulé, scène par scène. */
async function jouerLaVisite(js: (code: string) => Promise<unknown>): Promise<void> {
  const carton = (fort: string, doux = ''): Promise<unknown> =>
    js(`window.__carton(${JSON.stringify(fort)}, ${JSON.stringify(doux)})`)

  const allerA = async (libelle: string): Promise<void> => {
    await js(`
      (async () => {
        const lien = Array.from(document.querySelectorAll('.nav-lien'))
          .find((a) => a.textContent && a.textContent.trim().startsWith(${JSON.stringify(libelle)}))
        if (lien) lien.click()
        await new Promise((r) => setTimeout(r, 700))
        return true
      })()`)
    await attendre(400)
  }

  const saisir = (selecteur: string, texte: string, cadence = 90): Promise<unknown> =>
    js(`
      (async () => {
        const champ = document.querySelector(${JSON.stringify(selecteur)})
        if (!champ) return false
        champ.focus()
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        let courant = ''
        for (const c of ${JSON.stringify(texte)}) {
          courant += c
          setter.call(champ, courant)
          champ.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, ${cadence}))
        }
        return true
      })()`)

  // --- 0. Carton d'ouverture ------------------------------------------------
  await js('window.__titre()')
  await attendre(3400)
  await js('window.__cacherTitre()')
  await attendre(700)

  // --- 1. Le tableau de bord -------------------------------------------------
  await allerA('Tableau de bord')
  await carton('Tout ce qui compte, en un écran', 'Ce qui manque, ce qui périme, ce qui a été vendu')
  await attendre(4200)

  // --- 2. Le comptoir --------------------------------------------------------
  await allerA('Ventes')
  await carton('Au comptoir : trois secondes par client')
  await attendre(1400)
  await saisir('.vente-recherche input', 'doli')
  await attendre(900)
  await js(`document.querySelector('.produit-ligne')?.click()`)
  await attendre(1100)
  await saisir('.vente-recherche input', 'amox')
  await attendre(1100)

  await carton(
    'Le logiciel vous dit ce que vous devez savoir',
    'Où trouver la boîte · quand elle périme · par quoi la remplacer'
  )
  await attendre(4600)

  await js(`document.querySelector('.produit-ligne')?.click()`)
  await attendre(1200)

  // --- 3. Encaisser ----------------------------------------------------------
  await carton('Encaisser', 'Compte juste, monnaie calculée, ticket imprimé')
  await js(`
    (() => {
      const b = Array.from(document.querySelectorAll('button'))
        .find((x) => x.textContent.trim() === 'Compte juste')
      b?.click()
      return true
    })()`)
  await attendre(3600)

  // --- 4. Un code inconnu ----------------------------------------------------
  await carton('Une boîte au code inconnu ?', 'Trois lettres, et le code est retenu pour toujours')
  await js(`
    (async () => {
      for (const c of '6161100999888') {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: c, code: 'Digit' + c, bubbles: true, cancelable: true
        }))
      }
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', bubbles: true, cancelable: true
      }))
      for (let i = 0; i < 40 && !document.querySelector('.rattachement'); i++) {
        await new Promise((r) => setTimeout(r, 100))
      }
      return true
    })()`)
  await attendre(1600)
  await saisir('.rattachement-saisie', 'doli', 130)
  await attendre(1300)
  await js(`document.querySelector('.rattachement-choix')?.click()`)
  await attendre(2600)

  // --- 5. Enregistrement rapide ---------------------------------------------
  await allerA('Produits')
  await carton('Un produit en six champs', 'Nom, quantité, prix — et c’est vendable')
  await js(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F3', bubbles: true, cancelable: true }))`
  )
  await attendre(1300)
  await saisir('.rapide-grille input', 'Paracétamol sirop enfant', 60)
  await attendre(2800)
  await js(`
    (() => {
      const b = Array.from(document.querySelectorAll('.modale button'))
        .find((x) => x.textContent.trim() === 'Annuler')
      b?.click()
      return true
    })()`)
  await attendre(900)

  // --- 6. Les péremptions ----------------------------------------------------
  await allerA('Péremptions')
  await carton('Ce qui va périmer', 'Avant que la boîte ne soit bonne à jeter')
  await attendre(4200)

  // --- 7. Les clients et le crédit ------------------------------------------
  await allerA('Clients')
  await carton('Qui vous doit quoi', 'À la ligne près, avec son relevé à imprimer')
  await attendre(4200)

  // --- 8. Le bilan du mois ---------------------------------------------------
  await allerA('Rapports')
  await carton('Le mois a-t-il été bon ?', 'Une feuille répond, chiffres à l’appui')
  await attendre(1600)
  await js(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true, cancelable: true }))`
  )
  await attendre(1500)
  await js(`
    (() => {
      const zone = document.getElementById('impression')
      if (!zone) return false
      const racine = zone.parentElement
      for (const enfant of Array.from(racine.children)) {
        if (enfant !== zone) enfant.style.display = 'none'
      }
      zone.style.cssText = 'display:block;background:#fff;color:#000;padding:26px 40px;'
      document.body.style.cssText = 'background:#fff;overflow:hidden;'
      return true
    })()`)
  await attendre(5200)

  // --- 9. Carton de clôture --------------------------------------------------
  await js('window.__cacherCarton()')
  await js(`window.__titre(
    '<div class="marque">PHARMINA</div>' +
    '<div class="phrase">Standard 275 000 FCFA &nbsp;·&nbsp; Premium 350 000 FCFA<br>payable en une tranche</div>' +
    '<div class="pied">GLOBALTECH BUSINESS TD · N’Djaména<br>+235 97 69 11 12 · 69 18 67 66</div>'
  )`)
  await attendre(5000)
}

principal().catch((erreur) => {
  console.error('ÉCHEC :', (erreur as Error).message)
  app.exit(1)
})
