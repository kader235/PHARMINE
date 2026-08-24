/**
 * Génère l'icône de l'application, en PNG et en ICO.
 *
 * Le dessin est décrit une seule fois, en SVG, et rendu par Electron lui-même :
 * pas de binaire opaque dans le dépôt, et l'icône se régénère si l'identité
 * visuelle change.
 *
 * NSIS refuse un PNG pour l'icône de l'installateur : il faut un vrai .ico.
 * On l'encode ici plutôt que d'ajouter une dépendance, car le format est
 * simple — un en-tête, un répertoire, puis une image DIB par taille.
 */
const { app, BrowserWindow, nativeImage } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const SOURCE = 512
const TAILLES = [256, 128, 64, 48, 32, 16]
const SORTIE = join(__dirname, '..', 'build')

const PAGE = `
<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: ${SOURCE}px; height: ${SOURCE}px; background: transparent; }
  svg { display: block; }
</style></head><body>
<svg width="${SOURCE}" height="${SOURCE}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fond" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#12897f"/>
      <stop offset="1" stop-color="#0a5f59"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="512" height="512" rx="112" fill="url(#fond)"/>
  <g fill="none" stroke="#ffffff" stroke-width="26"
     stroke-linecap="round" stroke-linejoin="round">
    <path d="M392 176 256 108 120 176v160l136 68 136-68V176Z"/>
    <path d="M126 180l130 64 130-64M256 244v160"/>
  </g>
</svg>
</body></html>`

/**
 * Encode une image en frame DIB pour un fichier ICO.
 *
 * Deux particularités du format : la hauteur déclarée vaut le double de la
 * hauteur réelle (l'image et son masque de transparence sont empilés), et les
 * lignes de pixels sont stockées de bas en haut.
 */
function frameDIB(image, taille) {
  const bgra = image.toBitmap() // BGRA, de haut en bas
  const largeurOctets = taille * 4
  const xor = Buffer.alloc(taille * largeurOctets)

  for (let y = 0; y < taille; y++) {
    const source = y * largeurOctets
    const destination = (taille - 1 - y) * largeurOctets
    bgra.copy(xor, destination, source, source + largeurOctets)
  }

  // Masque AND : 1 bit par pixel, lignes alignées sur 4 octets. La
  // transparence réelle est portée par le canal alpha, ce masque reste donc
  // à zéro — mais il doit être présent, sinon Windows refuse l'icône.
  const octetsParLigne = Math.ceil(taille / 32) * 4
  const masque = Buffer.alloc(taille * octetsParLigne)

  const entete = Buffer.alloc(40)
  entete.writeUInt32LE(40, 0) // biSize
  entete.writeInt32LE(taille, 4) // biWidth
  entete.writeInt32LE(taille * 2, 8) // biHeight : image + masque
  entete.writeUInt16LE(1, 12) // biPlanes
  entete.writeUInt16LE(32, 14) // biBitCount
  entete.writeUInt32LE(0, 16) // biCompression : BI_RGB
  entete.writeUInt32LE(xor.length + masque.length, 20) // biSizeImage

  return Buffer.concat([entete, xor, masque])
}

function encoderICO(source) {
  const frames = TAILLES.map((taille) => ({
    taille,
    donnees: frameDIB(source.resize({ width: taille, height: taille, quality: 'best' }), taille)
  }))

  const entete = Buffer.alloc(6)
  entete.writeUInt16LE(0, 0) // réservé
  entete.writeUInt16LE(1, 2) // type : icône
  entete.writeUInt16LE(frames.length, 4)

  const repertoire = Buffer.alloc(16 * frames.length)
  let decalage = entete.length + repertoire.length

  frames.forEach((frame, i) => {
    const p = i * 16
    // 0 signifie 256 : la largeur tient sur un seul octet.
    repertoire.writeUInt8(frame.taille === 256 ? 0 : frame.taille, p)
    repertoire.writeUInt8(frame.taille === 256 ? 0 : frame.taille, p + 1)
    repertoire.writeUInt8(0, p + 2) // palette
    repertoire.writeUInt8(0, p + 3) // réservé
    repertoire.writeUInt16LE(1, p + 4) // plans
    repertoire.writeUInt16LE(32, p + 6) // bits par pixel
    repertoire.writeUInt32LE(frame.donnees.length, p + 8)
    repertoire.writeUInt32LE(decalage, p + 12)
    decalage += frame.donnees.length
  })

  return Buffer.concat([entete, repertoire, ...frames.map((f) => f.donnees)])
}

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  mkdirSync(SORTIE, { recursive: true })

  const fenetre = new BrowserWindow({
    width: SOURCE,
    height: SOURCE,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true }
  })

  await fenetre.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(PAGE))
  await new Promise((r) => setTimeout(r, 400))

  const capture = await fenetre.webContents.capturePage()

  // La capture suit le facteur d'échelle de l'écran : on repart d'une image
  // carrée de taille connue pour que les redimensionnements soient nets.
  const source = nativeImage.createFromBuffer(capture.toPNG()).resize({
    width: SOURCE,
    height: SOURCE,
    quality: 'best'
  })

  writeFileSync(join(SORTIE, 'icon.png'), source.toPNG())
  writeFileSync(join(SORTIE, 'icon.ico'), encoderICO(source))

  console.log(`icon.png ${source.getSize().width}x${source.getSize().height}`)
  console.log(`icon.ico ${TAILLES.join(', ')} px`)
  app.exit(0)
})
