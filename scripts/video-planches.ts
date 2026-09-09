/**
 * Extrait des images fixes d'une vidéo produite par le logiciel.
 *
 *     npm run video:planches -- Video-PHARMINA-vertical.mp4
 *
 * Sortie : planches-video/00.png, 01.png … à raison d'une image par seconde.
 *
 * POURQUOI CE SCRIPT EXISTE
 *
 * Une vidéo qui s'enregistre sans erreur peut être noire, décalée, ou montrer
 * un écran qui n'a pas fini de se dessiner. Le poids du fichier ne dit rien :
 * une image fixe se compresse jusqu'à presque rien. Il faut donc la regarder.
 *
 * PAS DE DÉPLACEMENT DANS LA VIDÉO, ON LA JOUE
 *
 * Le fichier vient de MediaRecorder : il est écrit au fil de l'eau et ne porte
 * pas la table d'index qui permet de sauter à un instant précis. `currentTime`
 * y est donc peu fiable — et sa durée peut valoir l'infini. On lit la vidéo du
 * début à la fin, et on prend une image au passage.
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const source = resolve(process.argv[2] ?? 'Video-PHARMINA-vertical.mp4')
const dossier = join(process.cwd(), 'planches-video')

app.on('window-all-closed', () => {
  /* on décide nous-mêmes quand rendre la main */
})

app.whenReady().then(async () => {
  if (!existsSync(source)) {
    console.log(`\n  Vidéo introuvable : ${source}\n`)
    app.exit(1)
    return
  }

  rmSync(dossier, { recursive: true, force: true })
  mkdirSync(dossier, { recursive: true })

  // La page est écrite à côté de la vidéo : chargée par « file: », elle a le
  // droit de lire un fichier voisin. Depuis une URL « data: », non.
  const page = join(process.cwd(), '.planches.html')
  writeFileSync(
    page,
    '<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000"></body>',
    'utf8'
  )

  const fenetre = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false }
  })
  await fenetre.loadFile(page)

  let compte = 0
  ipcMain.on('planche', (_e, donnees: string) => {
    const nom = join(dossier, `${String(compte++).padStart(2, '0')}.png`)
    writeFileSync(nom, Buffer.from(donnees.split(',')[1]!, 'base64'))
  })

  const fini = new Promise<number>((resoudre) => {
    ipcMain.once('planches-finies', (_e, secondes: number) => resoudre(secondes))
  })

  await fenetre.webContents.executeJavaScript(`
    (async () => {
      const { ipcRenderer } = require('electron')
      const video = document.createElement('video')
      video.src = 'file:///' + ${JSON.stringify(source.replace(/\\/g, '/'))}
      video.muted = true
      document.body.appendChild(video)
      await new Promise((r) => video.addEventListener('loadeddata', r, { once: true }))

      const toile = document.createElement('canvas')
      toile.width = video.videoWidth
      toile.height = video.videoHeight
      const pinceau = toile.getContext('2d')

      let prochaine = 0
      const debut = performance.now()
      const prendre = () => {
        pinceau.drawImage(video, 0, 0, toile.width, toile.height)
        ipcRenderer.send('planche', toile.toDataURL('image/png'))
      }

      video.play()
      // On attend la premiere image reellement decodee : sinon la toile est
      // encore vierge et la planche 00 sort blanche, ce qui fait croire a un
      // defaut de la video.
      await new Promise((r) => {
        if (video.currentTime > 0) return r()
        video.addEventListener('timeupdate', function une() {
          if (video.currentTime > 0) { video.removeEventListener('timeupdate', une); r() }
        })
      })

      await new Promise((resoudre) => {
        const boucle = () => {
          const ecoule = (performance.now() - debut) / 1000
          if (ecoule >= prochaine) {
            prendre()
            prochaine += 1
          }
          if (video.ended) resoudre()
          else requestAnimationFrame(boucle)
        }
        requestAnimationFrame(boucle)
        video.addEventListener('ended', resoudre, { once: true })
      })

      ipcRenderer.send('planches-finies', (performance.now() - debut) / 1000)
      return true
    })()`)

  const secondes = await fini
  await new Promise((r) => setTimeout(r, 400))

  console.log('')
  console.log(`  ${compte} images — ${Math.round(secondes * 10) / 10} s de vidéo`)
  console.log(`  ${dossier}`)
  console.log('')

  fenetre.destroy()
  rmSync(page, { force: true })
  app.exit(0)
})
