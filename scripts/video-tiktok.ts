/**
 * Enregistre la vidéo verticale, au format des réseaux.
 *
 *     npm run video:tiktok
 *
 * Sortie : Video-PHARMINA-vertical.mp4 — 720 × 1280, H.264.
 *
 * DES GROS PLANS, ET NON LA FENÊTRE ENTIÈRE
 *
 * PHARMINA est un logiciel de bureau : son écran est large. Réduit à la
 * largeur d'un téléphone, le texte de l'interface tombe sous les huit pixels —
 * illisible, et l'impression d'un logiciel étriqué par-dessus le marché.
 *
 * Chaque plan cadre donc la zone qui l'intéresse : la barre de recherche, le
 * panier, le règlement, le tableau des péremptions. Le cadre est mesuré dans
 * la page elle-même, au moment de la scène, et la caméra glisse de l'un à
 * l'autre. Le spectateur voit gros ce qu'on lui montre, et le mouvement fait
 * le reste.
 *
 * POURQUOI L'IMAGE EST COMPOSÉE SUR UNE TOILE
 *
 * Première tentative : une fenêtre de 720 × 1280 qu'on filmait telle quelle.
 * L'écran de la machine fait 1536 × 864 — Windows a ramené la fenêtre à la
 * hauteur disponible, et la vidéo est sortie avec deux bandes noires. Une mise
 * en page qui dépend de l'écran du poste qui l'a produite n'est pas
 * reproductible.
 *
 * On filme donc l'application dans une fenêtre de taille ordinaire, et on la
 * redessine, image par image, dans une toile de 720 × 1280 où l'on écrit aussi
 * les textes. La toile n'est pas une fenêtre : sa taille ne dépend d'aucun
 * écran. C'est elle qu'on enregistre.
 *
 * LE RYTHME
 *
 * Environ quarante secondes, neuf plans. Au-delà, personne ne reste. Chaque
 * plan tient sur une phrase, et les coupes tombent sur un temps régulier — de
 * quoi poser une musique dessus sans que rien ne se décale.
 *
 * PAS DE MUSIQUE ICI, ET C'EST VOULU
 *
 * Electron n'enregistre que l'image. Surtout, une bande-son prise ailleurs se
 * fait museler par les plateformes au titre du droit d'auteur : la musique
 * s'ajoute au moment de publier, depuis la bibliothèque sous licence de la
 * plateforme elle-même.
 */
import { app, BrowserWindow, Menu, desktopCapturer, ipcMain } from 'electron'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { fermerBase, ouvrirBase } from '../src/main/db'
import { chemins, enregistrerCanaux } from '../src/main/ipc'
import * as licence from '../src/main/services/licence'
import { garnirOfficine, licencePremiumPour } from './demo-officine'

/** 720 × 1280 : le neuf-seizièmes des réseaux, sans peser inutilement. */
const LARGEUR = 720
const HAUTEUR = 1280

/**
 * La fenêtre filmée.
 *
 * Presque carrée, et non 16/9 : réduite à la largeur du cadre, une fenêtre
 * large ne ferait qu'un bandeau de 400 pixels au milieu d'une image qui en
 * fait 1280. Le logiciel reste parfaitement lisible en 820 de large.
 */
const APP_LARGEUR = 820
const APP_HAUTEUR = 1000

/**
 * Le cadre : bande de titre, application, bande de pied.
 *
 * La hauteur de l'écran n'est pas connue d'avance — sur cette machine, Windows
 * a ramené une fenêtre de 1000 de haut à 824. On ne peut donc pas figer la
 * place de l'application dans le cadre : elle se déduit de la taille que la
 * fenêtre a réellement obtenue, faute de quoi l'image serait étirée.
 *
 * Le bas de l'image reste dégagé : les réseaux y posent eux-mêmes le nom du
 * compte, la légende et leurs boutons. Ce qui doit être lu — le prix, le
 * numéro — se tient au-dessus.
 */
const APP_HAUT = 350
const placeDeLApplication = (largeur: number, hauteur: number): { haut: number; bas: number } => ({
  haut: APP_HAUT,
  bas: APP_HAUT + Math.round((LARGEUR * hauteur) / largeur)
})

const sortie = join(process.cwd(), 'Video-PHARMINA-vertical.mp4')
const CLE_PRIVEE = join(process.cwd(), 'licence-privee.pem')

const dossierTravail = mkdtempSync(join(tmpdir(), 'pharmina-tiktok-'))
const cheminBase = join(dossierTravail, 'donnees', 'pharmina.db')

app.on('window-all-closed', () => {
  /* on décide nous-mêmes quand rendre la main */
})

const attendre = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function principal(): Promise<void> {
  if (!existsSync(CLE_PRIVEE)) {
    console.log('\n  Clé de licence introuvable : la démonstration resterait bridée.\n')
    process.exit(1)
  }

  await app.whenReady()
  Menu.setApplicationMenu(null)

  licence.definirDossierLicence(join(dossierTravail, 'donnees'))
  ouvrirBase(cheminBase)
  garnirOfficine()

  const etat = licence.etat(0)
  licence.activer(licencePremiumPour(etat.codeInstallation, CLE_PRIVEE), 1)
  console.log(`  poste activé en Premium : ${etat.codeInstallation}`)

  chemins(cheminBase, join(dossierTravail, 'sauvegardes'))
  enregistrerCanaux()

  // --- La scène : l'application, filmée telle quelle -------------------------
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
      // Cloison etanche : sans elle, la fenetre herite du stockage local du
      // poste de l'editeur — le theme retenu la derniere fois s'y trouve, et
      // la video est sortie en Cobalt alors que le logiciel livre est vert.
      // Une cloison sans le prefixe « persist: » ne survit pas au processus.
      partition: 'vitrine',
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
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
  scene.webContents.on('unresponsive', () => console.log('  [page] ne répond plus'))

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

  // --- L'atelier : la toile où l'image est composée --------------------------
  const pageAtelier = join(dossierTravail, 'atelier.html')
  writeFileSync(pageAtelier, '<!doctype html><meta charset="utf-8"><body></body>', 'utf8')

  const atelier = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // Une fenêtre masquée voit ses minuteries ralenties à une par seconde :
      // la vidéo n'aurait qu'une image par seconde.
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

  await jouer(js, (code) => atelier.webContents.executeJavaScript(code))

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
 * Il reçoit le flux de la fenêtre de l'application, le redessine réduit dans
 * la toile, écrit les textes par-dessus, et enregistre la toile.
 *
 * Aucune apostrophe inversée dans ce texte : il est lui-même livré dans un
 * gabarit, et une seule suffirait à couper le script en silence.
 */
function montage(sourceLargeur: number, sourceHauteur: number, sourceId: string): string {
  const { haut, bas } = placeDeLApplication(sourceLargeur, sourceHauteur)
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
      toile.width = ${LARGEUR}
      toile.height = ${HAUTEUR}
      document.body.appendChild(toile)
      const p = toile.getContext('2d')

      // --- Le cadrage -------------------------------------------------------
      const SL = ${sourceLargeur}, SH = ${sourceHauteur}
      const RAPPORT = ${LARGEUR} / ${bas - haut}

      // Un cadre demande a rarement les proportions de l'image : on l'elargit
      // autour de son centre jusqu'a les retrouver, puis on le ramene dans la
      // fenetre. Sans quoi l'application serait etiree.
      // On ne grossit jamais plus de moitie : au-dela, le gros plan coupe les
      // panneaux voisins en plein milieu et l'ecran devient illisible de sens.
      const PLUS_PETIT = ${LARGEUR} / 1.35

      const ajuster = (r) => {
        let l = r.l, h = r.h
        if (l / h < RAPPORT) l = h * RAPPORT
        else h = l / RAPPORT
        if (l < PLUS_PETIT) { l = PLUS_PETIT; h = l / RAPPORT }
        if (l > SL) { l = SL; h = l / RAPPORT }
        if (h > SH) { h = SH; l = h * RAPPORT }
        const cx = r.x + r.l / 2, cy = r.y + r.h / 2
        return {
          x: Math.max(0, Math.min(SL - l, cx - l / 2)),
          y: Math.max(0, Math.min(SH - h, cy - h / 2)),
          l: l,
          h: h
        }
      }

      const TOUT = ajuster({ x: 0, y: 0, l: SL, h: SH })

      // --- L'etat courant, que les plans font varier ------------------------
      const etat = {
        phrase: [], detail: [], fin: null, alpha: 0, cible: 1, suivant: null,
        cadre: { x: TOUT.x, y: TOUT.y, l: TOUT.l, h: TOUT.h },
        vise: TOUT
      }

      window.__cadre = (r) => { etat.vise = r ? ajuster(r) : TOUT }

      window.__plan = (phrase, detail) => {
        etat.suivant = { phrase: phrase, detail: detail, fin: null }
        etat.cible = 0
      }
      window.__fin = (lignes) => {
        etat.suivant = { phrase: [], detail: [], fin: lignes }
        etat.cible = 0
      }

      const POLICE = '"Segoe UI", system-ui, sans-serif'
      const ligne = (texte, y, taille, poids, alpha, espace) => {
        p.font = poids + ' ' + taille + 'px ' + POLICE
        p.letterSpacing = (espace || 0) + 'px'
        p.globalAlpha = alpha
        p.fillText(texte, ${LARGEUR} / 2, y)
        p.letterSpacing = '0px'
        p.globalAlpha = 1
      }

      const dessiner = () => {
        // Fondu : on efface le texte avant d'ecrire la suite, jamais pendant.
        const pas = 0.09
        if (etat.alpha < etat.cible) etat.alpha = Math.min(etat.cible, etat.alpha + pas)
        else if (etat.alpha > etat.cible) etat.alpha = Math.max(etat.cible, etat.alpha - pas)
        if (etat.alpha === 0 && etat.suivant) {
          etat.phrase = etat.suivant.phrase
          etat.detail = etat.suivant.detail
          etat.fin = etat.suivant.fin
          etat.suivant = null
          etat.cible = 1
        }

        // Le fond, en degrade : un aplat unique fait terne sur un telephone.
        const fond = p.createLinearGradient(0, 0, 0, ${HAUTEUR})
        fond.addColorStop(0, '#0d6c57')
        fond.addColorStop(0.5, '#0a5c49')
        fond.addColorStop(1, '#08483a')
        p.fillStyle = fond
        p.fillRect(0, 0, ${LARGEUR}, ${HAUTEUR})

        // L'ombre portee detache l'ecran du fond : sans elle, il a l'air colle.
        p.save()
        p.shadowColor = 'rgba(0, 0, 0, 0.45)'
        p.shadowBlur = 34
        p.shadowOffsetY = 14
        p.fillStyle = '#000'
        p.fillRect(0, ${haut}, ${LARGEUR}, ${bas - haut})
        p.restore()

        // La camera glisse vers le cadre demande, elle n'y saute pas : un saut
        // sec donne l'impression d'un montage rate.
        const c = etat.cadre, v = etat.vise
        const gain = 0.14
        c.x += (v.x - c.x) * gain
        c.y += (v.y - c.y) * gain
        c.l += (v.l - c.l) * gain
        c.h += (v.h - c.h) * gain
        p.drawImage(video, c.x, c.y, c.l, c.h, 0, ${haut}, ${LARGEUR}, ${bas - haut})

        p.textAlign = 'center'

        p.fillStyle = '#ffffff'
        ligne('PHARMINA', 78, 42, '800', 1, -1)
        p.fillStyle = 'rgba(255, 255, 255, 0.72)'
        ligne('LOGICIEL DE PHARMACIE', 110, 16, '600', 1, 3)

        p.fillStyle = '#ffffff'
        let y = 200
        for (const t of etat.phrase) { ligne(t, y, 38, '700', etat.alpha); y += 46 }

        p.fillStyle = 'rgba(255, 255, 255, 0.86)'
        y = ${bas} + 58
        for (const t of etat.detail) { ligne(t, y, 25, '400', etat.alpha); y += 34 }

        if (etat.fin) {
          p.fillStyle = '#ffffff'
          y = 200
          for (const t of etat.fin.fort) { ligne(t, y, 36, '700', etat.alpha); y += 48 }
          p.fillStyle = 'rgba(255, 255, 255, 0.86)'
          y = ${bas} + 58
          for (const t of etat.fin.doux) { ligne(t, y, 24, '400', etat.alpha); y += 34 }
        }
      }

      // Une minuterie, et non requestAnimationFrame : celui-ci ne se declenche
      // pas dans une fenetre qui n'est jamais composee a l'ecran.
      // Une premiere image avant de lancer l'enregistrement : sans elle, la
      // video commence par une image noire, dont les reseaux font volontiers
      // la vignette.
      dessiner()
      const battement = setInterval(dessiner, 33)

      const morceaux = []
      const enr = new MediaRecorder(toile.captureStream(30), {
        mimeType: 'video/mp4;codecs=avc1',
        videoBitsPerSecond: 5000000
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

/** Un rectangle de la page, en pixels, tel que la caméra doit le cadrer. */
interface Cadre {
  x: number
  y: number
  l: number
  h: number
}

/** Neuf plans. Les coupes tombent sur un temps régulier. */
async function jouer(
  js: (code: string) => Promise<unknown>,
  toile: (code: string) => Promise<unknown>
): Promise<void> {
  const plan = (phrase: string[], detail: string[] = []): Promise<unknown> =>
    toile(`window.__plan(${JSON.stringify(phrase)}, ${JSON.stringify(detail)})`)

  const allerA = async (libelle: string): Promise<void> => {
    await js(`
      (async () => {
        const lien = Array.from(document.querySelectorAll('.nav-lien'))
          .find((a) => a.textContent && a.textContent.trim().startsWith(${JSON.stringify(libelle)}))
        if (lien) lien.click()
        await new Promise((r) => setTimeout(r, 600))
        return true
      })()`)
  }

  /**
   * Mesure, dans la page, l'englobant des éléments demandés.
   *
   * Le cadrage est pris sur la page réelle et non sur des coordonnées écrites
   * à la main : une marge qui change dans la feuille de style déplacerait
   * sinon la caméra sans que personne ne s'en aperçoive.
   */
  const mesurer = async (selecteurs: string[], marge = 26): Promise<Cadre | null> =>
    (await js(`
      (async () => {
        const mesure = () => {
          let g = null, ht = 0, d = 0, b = 0
          for (const nom of ${JSON.stringify(selecteurs)}) {
            for (const el of document.querySelectorAll(nom)) {
              const r = el.getBoundingClientRect()
              if (r.width < 40 || r.height < 24) continue
              if (g === null) { g = r.left; ht = r.top; d = r.right; b = r.bottom }
              else {
                g = Math.min(g, r.left); ht = Math.min(ht, r.top)
                d = Math.max(d, r.right); b = Math.max(b, r.bottom)
              }
            }
          }
          if (g === null) return null
          const m = ${marge}
          return { x: g - m, y: ht - m, l: d - g + 2 * m, h: b - ht + 2 * m }
        }

        // On attend que l'element existe : un ecran qui va chercher ses donnees
        // met un instant a s'afficher, et mesurer trop tot renvoyait la fenetre
        // entiere — ou pire, cadrait un ecran encore vide.
        for (let i = 0; i < 40; i++) {
          const boite = mesure()
          if (boite) return boite
          await new Promise((r) => setTimeout(r, 100))
        }
        return null
      })()`)) as Cadre | null

  /**
   * Ne garder qu'une part de la boîte mesurée.
   *
   * Le cadre de la vidéo est presque carré ; une bande large et basse — un
   * tableau, une rangée d'indicateurs — se retrouve étirée jusqu'à la hauteur
   * de la fenêtre entière pour retrouver ces proportions, et le gros plan
   * n'agrandit plus rien. On en prend donc un morceau.
   */
  type Part = 'entier' | 'gauche' | 'droite' | 'haut'
  const morceau = (boite: Cadre | null, part: Part): Cadre | null => {
    if (!boite || part === 'entier') return boite
    if (part === 'haut') return { ...boite, h: boite.h * 0.6 }
    const l = boite.l * 0.6
    return { ...boite, x: part === 'droite' ? boite.x + boite.l - l : boite.x, l }
  }

  /** Amène la caméra sur ces éléments ; sur toute la fenêtre s'ils manquent. */
  const cadrer = async (selecteurs: string[], marge = 26, part: Part = 'entier'): Promise<void> => {
    const boite = morceau(await mesurer(selecteurs, marge), part)
    await toile('window.__cadre(' + JSON.stringify(boite) + ')')
  }

  const saisir = (selecteur: string, texte: string, cadence = 85): Promise<unknown> =>
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

  // 1 — l'accroche : les chiffres du jour, en gros
  await allerA('Tableau de bord')
  // La camera part de la fenetre entiere et s'approche : une ouverture qui
  // saute d'un cadre a l'autre passe pour un defaut de montage.
  await cadrer(['.indicateurs.bande', '.pilotage'], 14, 'haut')
  await plan(['Votre pharmacie,', 'tenue au jour le jour'], ['Ventes · Stock · Caisse · Clients'])
  await attendre(2400)
  await cadrer(['.faits', '.alerte-ligne'], 18)
  await attendre(2000)

  // 2 — le comptoir : la recherche, puis le panier qui se remplit
  await allerA('Ventes')
  await cadrer(['.vente-recherche'], 30)
  await plan(['Trois secondes', 'par client'], ['On tape trois lettres, on encaisse'])
  await attendre(900)
  await saisir('.vente-recherche input', 'doli')
  await attendre(900)
  await js(`document.querySelector('.produit-ligne')?.click()`)
  await cadrer(['.panier-lignes', '.total-a-payer'], 22)
  await attendre(2000)

  // 3 — la fiche produit : emplacement, péremption, équivalents
  await plan(
    ['Il vous dit tout', 'avant de servir'],
    ['Où est la boîte, quand elle périme,', 'par quoi la remplacer']
  )
  await cadrer(['.vente-recherche'], 30)
  await saisir('.vente-recherche input', 'amox')
  await attendre(900)
  await cadrer(['.produit-ligne'], 22)
  await attendre(2200)
  await js(`document.querySelector('.produit-ligne')?.click()`)
  await attendre(1500)

  // 4 — encaisser : le règlement, rien d'autre
  await plan(['Encaisser'], ['Compte juste, monnaie calculée,', 'ticket imprimé'])
  await cadrer(['.reglement', '.total-a-payer'], 22)
  await attendre(1200)
  await js(`
    (() => {
      const b = Array.from(document.querySelectorAll('button'))
        .find((x) => x.textContent.trim() === 'Compte juste')
      b?.click()
      return true
    })()`)
  await attendre(2800)

  // 5 — le code inconnu
  await plan(['Un code inconnu ?', 'Trois lettres'], ['Et il est retenu pour toujours'])
  await cadrer(['.vente-recherche'], 30)
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
  await attendre(600)
  await cadrer(['.rattachement'], 26)
  await attendre(600)
  await saisir('.rattachement-saisie', 'doli', 120)
  await attendre(900)
  await js(`document.querySelector('.rattachement-choix')?.click()`)
  await attendre(1800)

  // 6 — les péremptions
  await allerA('Péremptions')
  await cadrer(['.indicateurs'], 18)
  await attendre(200)
  await plan(['Plus rien ne périme', 'en silence'], ['Le logiciel vous prévient à temps'])
  await attendre(1800)
  await cadrer(['.tableau'], 14)
  await attendre(2000)

  // 7 — les crédits
  await allerA('Clients')
  await cadrer(['.tableau tbody tr', '.tableau'], 14)
  await plan(['Qui vous doit quoi'], ['À la ligne près, avec son relevé'])
  await attendre(3200)

  // 8 — le bilan
  await allerA('Rapports')
  await cadrer(['.panneau-corps'], 20)
  await plan(['Le mois a-t-il', 'été bon ?'], ['Une feuille répond, chiffres à l’appui'])
  await attendre(1400)
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
      zone.style.cssText = 'display:block;background:#fff;color:#000;padding:20px 28px;'
      document.body.style.background = '#fff'
      return true
    })()`)
  await attendre(400)
  await cadrer(['#impression'], 24)
  await attendre(3200)

  // 9 — la clôture
  await toile(
    `window.__fin(${JSON.stringify({
      fort: ['Standard 275 000 FCFA', 'Premium 350 000 FCFA'],
      doux: ['GLOBALTECH BUSINESS TD · N’Djaména', '+235 97 69 11 12 · 69 18 67 66']
    })})`
  )
  await attendre(4800)
}

principal().catch((erreur) => {
  console.error('ÉCHEC :', (erreur as Error).message)
  app.exit(1)
})
