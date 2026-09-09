/**
 * Enregistre la vidéo de démonstration de PHARMINA, au format large.
 *
 *     npm run video
 *
 * Sortie : Video-PHARMINA.mp4, à la racine du dépôt. 1536 × 864, H.264, prêt
 * pour WhatsApp — c'est par là que la publicité circule au Tchad.
 *
 * COMMENT C'EST FILMÉ
 *
 * Trois pièces. L'application, visible, qu'on filme ; un atelier masqué qui
 * compose l'image et l'enregistre ; et le déroulé, plus bas dans ce fichier,
 * qui pilote l'une et renseigne l'autre.
 *
 * On capture la FENÊTRE, pas l'écran : ce qui passe par-dessus pendant
 * l'enregistrement a moins de chances d'apparaître, et rien de la machine de
 * l'éditeur ne se retrouve dans une vidéo publique.
 *
 * POURQUOI L'IMAGE EST COMPOSÉE SUR UNE TOILE
 *
 * La version précédente demandait une fenêtre de 1600 × 900 et filmait ce
 * format. L'écran de la machine fait 1536 × 864 : Windows ramenait la fenêtre
 * à la place disponible, la capture complétait le reste en noir, et la vidéo
 * sortait avec deux bandes. Les cartons, calés sur le bas de l'image, se
 * retrouvaient à cheval sur cette bande.
 *
 * L'image est donc composée sur une toile aux dimensions choisies, où
 * l'application est redessinée à sa taille réelle, sans étirement ni bande.
 * Une toile n'est pas une fenêtre : sa taille ne dépend d'aucun écran.
 *
 * TROIS PIÈGES RENCONTRÉS, POUR QUI REPRENDRA CE FICHIER
 *
 *   — `navigator.mediaDevices` n'existe PAS sur une URL « data: » : ce n'est
 *     pas un contexte sécurisé. L'atelier se charge donc depuis un fichier ;
 *   — détruire une fenêtre déclenche `window-all-closed`, dont le
 *     comportement par défaut ferme l'application. On rend la main nous-mêmes ;
 *   — une fenêtre masquée voit ses minuteries ralenties à une par seconde.
 *     L'atelier désactive ce ralentissement, sans quoi la vidéo n'aurait
 *     qu'une image par seconde.
 *
 * CE QUE CETTE VIDÉO N'A PAS
 *
 * Ni voix, ni musique : Electron ne sait qu'enregistrer l'image. Les cartons
 * portent donc le discours, et le rythme est calculé pour qu'on ait le temps
 * de les lire sans s'ennuyer. Une musique s'ajoute au montage, ou au moment de
 * publier — prise ailleurs, elle se ferait museler au titre du droit d'auteur.
 */
import { app, BrowserWindow, Menu, desktopCapturer, ipcMain } from 'electron'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { fermerBase, ouvrirBase } from '../src/main/db'
import { chemins, enregistrerCanaux } from '../src/main/ipc'
import * as licence from '../src/main/services/licence'
import { garnirOfficine, licencePremiumPour } from './demo-officine'

/** La toile : seize neuvièmes, à la taille réelle de l'écran de travail. */
const TOILE_L = 1536
const TOILE_H = 864

/** Le bandeau de pied, présent d'un bout à l'autre. */
const PIED = 44
/** La bande où l'application est dessinée. */
const SCENE_H = TOILE_H - PIED

/** La fenêtre filmée, demandée aussi grande que la toile le permet. */
const APP_LARGEUR = TOILE_L
const APP_HAUTEUR = SCENE_H

const sortie = join(process.cwd(), 'Video-PHARMINA.mp4')
const CLE_PRIVEE = join(process.cwd(), 'licence-privee.pem')

const EDITEUR = 'GLOBALTECH BUSINESS TD · N’Djaména'
const TELEPHONES = '+235 97 69 11 12 · 69 18 67 66'

const dossierTravail = mkdtempSync(join(tmpdir(), 'pharmina-video-'))
const cheminBase = join(dossierTravail, 'donnees', 'pharmina.db')

app.on('window-all-closed', () => {
  /* on décide nous-mêmes quand rendre la main */
})

const attendre = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

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
    width: APP_LARGEUR,
    height: APP_HAUTEUR,
    useContentSize: true,
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
      // Cloison etanche : sans elle, la fenetre herite du stockage local du
      // poste de l'editeur — le theme retenu la derniere fois s'y trouve, et
      // la video est sortie en Cobalt alors que le logiciel livre est vert.
      // Une cloison sans le prefixe « persist: » ne survit pas au processus.
      partition: 'vitrine',
      backgroundThrottling: false
    }
  })

  // Un enregistrement se joue sans personne devant l'ecran : si la page casse
  // en cours de route, la video sort grise et rien ne le dit. On ecoute.
  scene.webContents.on('console-message', (_e, niveau, message) => {
    if (niveau >= 2) console.log(`  [page] ${message}`)
  })
  scene.webContents.on('render-process-gone', (_e, details) => {
    console.log(`  [page] le rendu s'est arrêté : ${details.reason}`)
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
        if (document.querySelector('.nav-lien')) break
      }
      return true
    })()`)

  const taille = scene.getContentSize()
  const largeurReelle = taille[0] ?? APP_LARGEUR
  const hauteurReelle = taille[1] ?? APP_HAUTEUR
  if (largeurReelle !== APP_LARGEUR || hauteurReelle !== APP_HAUTEUR) {
    console.log(`  fenêtre ramenée à ${largeurReelle} × ${hauteurReelle} par le système`)
  }

  // --- L'atelier ------------------------------------------------------------
  const pageAtelier = join(dossierTravail, 'atelier.html')
  writeFileSync(pageAtelier, '<!doctype html><meta charset="utf-8"><body></body>', 'utf8')

  const atelier = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false
    }
  })
  await atelier.loadFile(pageAtelier)

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
      console.log(`  ${sortie} — ${Math.round((octets.length / 1048576) * 10) / 10} Mo`)
      resoudre()
    })
  })

  await atelier.webContents.executeJavaScript(montage(largeurReelle, hauteurReelle, cible.id))

  console.log('  enregistrement en cours — ne touchez pas à la machine…')

  // Windows ne sait pas toujours rendre une fenetre recouverte : il donne
  // alors ce qui occupe sa place a l'ecran. Un explorateur de fichiers laisse
  // ouvert derriere s'est ainsi retrouve en plein milieu de la video, la liste
  // du dossier du projet lisible. On remet donc la scene au premier plan de
  // temps en temps.
  //
  // « alwaysOnTop » aurait ete plus simple, mais il fait tomber la capture :
  // essaye, la video est sortie vide sur cinquante et une images sur
  // soixante et onze.
  const auPremierPlan = setInterval(() => {
    if (!scene.isDestroyed()) scene.moveTop()
  }, 2000)

  await jouerLaVisite(js, (code) => atelier.webContents.executeJavaScript(code))

  clearInterval(auPremierPlan)

  await atelier.webContents.executeJavaScript('window.__arreter()')
  await fini

  scene.destroy()
  atelier.destroy()
  fermerBase()
  rmSync(dossierTravail, { recursive: true, force: true, maxRetries: 20, retryDelay: 120 })
  app.exit(0)
}

/**
 * Le code de l'atelier : il tourne dans la fenêtre masquée.
 *
 * Il reçoit le flux de la fenêtre de l'application, le redessine dans la
 * toile, y ajoute le pied de page, les cartons et les écrans de titre, et
 * enregistre la toile.
 *
 * Aucune apostrophe inversée dans ce texte : il est lui-même livré dans un
 * gabarit, et une seule suffirait à couper le script en silence.
 */
function montage(sourceLargeur: number, sourceHauteur: number, sourceId: string): string {
  return `
    (async () => {
      const { ipcRenderer } = require('electron')

      const flux = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: ${JSON.stringify(sourceId)},
            minWidth: ${sourceLargeur}, maxWidth: ${sourceLargeur},
            minHeight: ${sourceHauteur}, maxHeight: ${sourceHauteur},
            maxFrameRate: 30
          }
        }
      })

      const video = document.createElement('video')
      video.srcObject = flux
      video.muted = true
      await video.play()

      const toile = document.createElement('canvas')
      toile.width = ${TOILE_L}
      toile.height = ${TOILE_H}
      document.body.appendChild(toile)
      const p = toile.getContext('2d')

      const SL = ${sourceLargeur}, SH = ${sourceHauteur}

      // L'application, dessinee en entier et sans etirement : ce qui reste de
      // place autour d'elle appartient au fond, pas a du noir.
      const ECH = Math.min(${TOILE_L} / SL, ${SCENE_H} / SH)
      const DL = Math.round(SL * ECH), DH = Math.round(SH * ECH)
      const DX = Math.round((${TOILE_L} - DL) / 2), DY = Math.round((${SCENE_H} - DH) / 2)
      // Pas de gros plan ici, a la difference de la version verticale : en
      // seize neuviemes l'ecran entier tient deja, et tout cadrage plus serre
      // tranchait la barre laterale en son milieu.

      const etat = {
        fort: '', doux: '', alpha: 0, cible: 0, suivant: null,
        titre: null, titreAlpha: 0, titreCible: 0
      }

      window.__carton = (fort, doux) => {
        etat.suivant = { fort: fort, doux: doux || '' }
        etat.cible = 0
      }
      window.__cacherCarton = () => { etat.suivant = null; etat.cible = 0 }
      window.__titre = (t) => { etat.titre = t; etat.titreCible = 1 }
      window.__cacherTitre = () => { etat.titreCible = 0 }

      const POLICE = '"Segoe UI", system-ui, sans-serif'
      const ecrire = (texte, x, y, taille, poids, alpha, espace, aligne) => {
        p.font = poids + ' ' + taille + 'px ' + POLICE
        p.letterSpacing = (espace || 0) + 'px'
        p.textAlign = aligne || 'left'
        p.globalAlpha = alpha
        p.fillText(texte, x, y)
        p.letterSpacing = '0px'
        p.globalAlpha = 1
      }

      const glisser = (courant, cible, pas) => {
        if (courant < cible) return Math.min(cible, courant + pas)
        if (courant > cible) return Math.max(cible, courant - pas)
        return courant
      }

      const dessiner = () => {
        etat.alpha = glisser(etat.alpha, etat.cible, 0.08)
        if (etat.alpha === 0 && etat.suivant) {
          etat.fort = etat.suivant.fort
          etat.doux = etat.suivant.doux
          etat.suivant = null
          etat.cible = 1
        }
        etat.titreAlpha = glisser(etat.titreAlpha, etat.titreCible, 0.045)

        // Le fond ne se voit qu'aux marges, mais du noir donnerait
        // l'impression d'une capture ratee.
        const fond = p.createLinearGradient(0, 0, 0, ${TOILE_H})
        fond.addColorStop(0, '#0d6c57')
        fond.addColorStop(1, '#08483a')
        p.fillStyle = fond
        p.fillRect(0, 0, ${TOILE_L}, ${TOILE_H})

        p.drawImage(video, 0, 0, SL, SH, DX, DY, DL, DH)

        // --- Le carton ------------------------------------------------------
        if (etat.alpha > 0.01 && etat.fort) {
          const hauteur = etat.doux ? 182 : 132
          const bas = ${SCENE_H}
          const voile = p.createLinearGradient(0, bas - hauteur, 0, bas)
          voile.addColorStop(0, 'rgba(6, 40, 32, 0)')
          voile.addColorStop(0.45, 'rgba(6, 40, 32, 0.74)')
          voile.addColorStop(1, 'rgba(6, 40, 32, 0.94)')
          p.globalAlpha = etat.alpha
          p.fillStyle = voile
          p.fillRect(0, bas - hauteur, ${TOILE_L}, hauteur)
          p.globalAlpha = 1

          // Un filet clair sous le texte : il donne au carton un bord net et
          // le rattache au pied de page.
          p.globalAlpha = etat.alpha * 0.55
          p.fillStyle = '#7fd8bf'
          p.fillRect(56, bas - 30, 74, 3)
          p.globalAlpha = 1

          p.fillStyle = '#ffffff'
          ecrire(etat.fort, 56, bas - (etat.doux ? 92 : 56), 38, '700', etat.alpha)
          if (etat.doux) {
            p.fillStyle = 'rgba(255, 255, 255, 0.88)'
            ecrire(etat.doux, 56, bas - 54, 25, '400', etat.alpha)
          }
        }

        // --- Le pied de page ------------------------------------------------
        p.fillStyle = '#073c31'
        p.fillRect(0, ${SCENE_H}, ${TOILE_L}, ${PIED})
        p.fillStyle = '#ffffff'
        ecrire('PHARMINA', 56, ${SCENE_H} + 29, 19, '800', 0.96, -0.4)
        p.fillStyle = 'rgba(255, 255, 255, 0.5)'
        ecrire('Gestion de pharmacie', 178, ${SCENE_H} + 29, 16, '400', 1)
        p.fillStyle = 'rgba(255, 255, 255, 0.68)'
        ecrire(
          ${JSON.stringify(EDITEUR + '   ·   ' + TELEPHONES)},
          ${TOILE_L} - 56, ${SCENE_H} + 29, 16, '400', 1, 0, 'right'
        )

        // --- L'ecran de titre -----------------------------------------------
        if (etat.titreAlpha > 0.01 && etat.titre) {
          const t = etat.titre
          const g = p.createLinearGradient(0, 0, ${TOILE_L}, ${TOILE_H})
          g.addColorStop(0, '#0f7a62')
          g.addColorStop(1, '#074236')
          p.globalAlpha = etat.titreAlpha
          p.fillStyle = g
          p.fillRect(0, 0, ${TOILE_L}, ${TOILE_H})
          p.globalAlpha = 1

          const milieu = ${TOILE_L} / 2
          p.fillStyle = '#ffffff'
          ecrire(t.marque, milieu, 366, 96, '800', etat.titreAlpha, -3, 'center')

          p.globalAlpha = etat.titreAlpha * 0.6
          p.fillStyle = '#7fd8bf'
          p.fillRect(milieu - 58, 402, 116, 3)
          p.globalAlpha = 1

          let y = 470
          p.fillStyle = 'rgba(255, 255, 255, 0.94)'
          for (const ligne of t.phrases) {
            ecrire(ligne, milieu, y, 32, '400', etat.titreAlpha, 0, 'center')
            y += 46
          }
          y += 30
          p.fillStyle = 'rgba(255, 255, 255, 0.7)'
          for (const ligne of t.pieds) {
            ecrire(ligne, milieu, y, 21, '400', etat.titreAlpha, 0, 'center')
            y += 32
          }
        }
      }

      // Une premiere image avant de lancer l'enregistrement : sans elle, la
      // video commence par une image noire, dont les reseaux font la vignette.
      dessiner()
      const battement = setInterval(dessiner, 33)

      const morceaux = []
      const enr = new MediaRecorder(toile.captureStream(30), {
        mimeType: 'video/mp4;codecs=avc1',
        videoBitsPerSecond: 8000000
      })
      enr.ondataavailable = (e) => { if (e.data.size) morceaux.push(e.data) }
      enr.onstop = async () => {
        clearInterval(battement)
        const tampon = await new Blob(morceaux, { type: 'video/mp4' }).arrayBuffer()
        ipcRenderer.send('video-prete', Array.from(new Uint8Array(tampon)))
      }
      enr.start(250)
      window.__arreter = () => enr.stop()
      return true
    })()`
}

/** Le déroulé, scène par scène. */
async function jouerLaVisite(
  js: (code: string) => Promise<unknown>,
  toile: (code: string) => Promise<unknown>
): Promise<void> {
  const carton = (fort: string, doux = ''): Promise<unknown> =>
    toile(`window.__carton(${JSON.stringify(fort)}, ${JSON.stringify(doux)})`)

  const allerA = async (libelle: string): Promise<void> => {
    await js(`
      (async () => {
        const lien = Array.from(document.querySelectorAll('.nav-lien'))
          .find((a) => a.textContent && a.textContent.trim().startsWith(${JSON.stringify(libelle)}))
        if (lien) lien.click()
        await new Promise((r) => setTimeout(r, 700))
        return true
      })()`)
    await attendre(300)
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
  await toile(
    `window.__titre(${JSON.stringify({
      marque: 'PHARMINA',
      phrases: ['Le logiciel qui tient votre pharmacie'],
      pieds: ['Ventes · Stock · Caisse · Clients']
    })})`
  )
  await attendre(3400)
  await toile('window.__cacherTitre()')
  await attendre(900)

  // --- 1. Le tableau de bord -------------------------------------------------
  await allerA('Tableau de bord')
  await carton('Tout ce qui compte, en un écran', 'Ce qui manque, ce qui périme, ce qui a été vendu')
  await attendre(6200)

  // --- 2. Le comptoir --------------------------------------------------------
  await allerA('Ventes')
  await carton('Au comptoir : trois secondes par client')
  await attendre(1400)
  await saisir('.vente-recherche input', 'doli')
  await attendre(900)
  await js(`document.querySelector('.produit-ligne')?.click()`)
  await attendre(1100)
  await saisir('.vente-recherche input', 'amox')
  await attendre(1000)

  await carton(
    'Le logiciel vous dit ce que vous devez savoir',
    'Où trouver la boîte · quand elle périme · par quoi la remplacer'
  )
  await attendre(4200)
  await js(`document.querySelector('.produit-ligne')?.click()`)
  await attendre(2200)

  // --- 3. Encaisser ----------------------------------------------------------
  await carton('Encaisser', 'Compte juste, monnaie calculée, ticket imprimé')
  await attendre(1200)
  await js(`
    (() => {
      const b = Array.from(document.querySelectorAll('button'))
        .find((x) => x.textContent.trim() === 'Compte juste')
      b?.click()
      return true
    })()`)
  await attendre(3700)

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
  await attendre(900)
  await saisir('.rattachement-saisie', 'doli', 130)
  await attendre(1200)
  await js(`document.querySelector('.rattachement-choix')?.click()`)
  await attendre(3100)

  // --- 5. Enregistrement rapide ---------------------------------------------
  await allerA('Produits')
  await carton('Un produit en six champs', 'Nom, quantité, prix — et c’est vendable')
  await js(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F3', bubbles: true, cancelable: true }))`
  )
  await attendre(1300)
  await saisir('.rapide-grille input', 'Paracétamol sirop enfant', 60)
  await attendre(2600)
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
  await attendre(4000)

  // --- 7. Les clients et le crédit ------------------------------------------
  await allerA('Clients')
  await carton('Qui vous doit quoi', 'À la ligne près, avec son relevé à imprimer')
  await attendre(4600)

  // --- 8. Le bilan du mois ---------------------------------------------------
  await allerA('Rapports')
  await carton('Le mois a-t-il été bon ?', 'Une feuille répond, chiffres à l’appui')
  await attendre(1600)
  await js(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true, cancelable: true }))`
  )
  await js(`
    (async () => {
      // Le bilan va chercher ses chiffres avant de s'afficher : styler la
      // feuille trop tot ne trouvait rien, et la video finissait sur l'ecran
      // des rapports au lieu du document.
      let zone = null
      for (let i = 0; i < 60; i++) {
        zone = document.getElementById('impression')
        if (zone) break
        await new Promise((r) => setTimeout(r, 100))
      }
      if (!zone) return false
      const racine = zone.parentElement
      for (const enfant of Array.from(racine.children)) {
        if (enfant !== zone) enfant.style.display = 'none'
      }
      zone.style.cssText = 'display:block;background:#fff;color:#000;padding:26px 40px;'
      document.body.style.cssText = 'background:#fff;overflow:hidden;'
      return true
    })()`)
  await attendre(4800)

  // --- 9. Carton de clôture --------------------------------------------------
  await toile('window.__cacherCarton()')
  await toile(
    `window.__titre(${JSON.stringify({
      marque: 'PHARMINA',
      phrases: ['Standard 275 000 FCFA   ·   Premium 350 000 FCFA', 'payable en une tranche'],
      pieds: [EDITEUR, TELEPHONES]
    })})`
  )
  await attendre(5000)
}

principal().catch((erreur) => {
  console.error('ÉCHEC :', (erreur as Error).message)
  app.exit(1)
})
