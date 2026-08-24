import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { fermerBase, ouvrirBase } from './db'
import { chemins, contexteActuel, enregistrerCanaux, terminerSession } from './ipc'
import { creerSauvegarde } from './services/configuration'
import { parametreBooleen } from './services/commun'
import { rafraichirAlertes } from './services/alertes'

const dossierDonnees = app.getPath('userData')
const cheminBase = join(dossierDonnees, 'donnees', 'pharmina.db')
const dossierSauvegardes = join(dossierDonnees, 'sauvegardes')

let fenetre: BrowserWindow | null = null

function creerFenetre(): void {
  fenetre = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: '#f1f4f4',
    title: 'PHARMINA',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Le rendu n'a aucun accès direct à Node ni à la base : il ne peut
      // agir que par les canaux déclarés, tous soumis à permission.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  fenetre.on('ready-to-show', () => {
    fenetre?.maximize()
    fenetre?.show()
  })

  // Aucun lien externe ne s'ouvre dans l'application elle-même.
  fenetre.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    fenetre.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    fenetre.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Une seule instance : deux fenêtres sur la même base mèneraient à des
// incohérences de caisse.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (fenetre) {
      if (fenetre.isMinimized()) fenetre.restore()
      fenetre.focus()
    }
  })

  app.whenReady().then(() => {
    try {
      ouvrirBase(cheminBase)
    } catch (erreur) {
      console.error('[pharmina] ouverture de la base impossible', erreur)
      app.quit()
      return
    }

    chemins(cheminBase, dossierSauvegardes)
    enregistrerCanaux()

    try {
      rafraichirAlertes()
    } catch {
      /* base neuve, pas encore configurée */
    }

    creerFenetre()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) creerFenetre()
    })
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('before-quit', () => {
    const ctx = contexteActuel()
    try {
      if (parametreBooleen('sauvegarde.automatique', true)) {
        creerSauvegarde(cheminBase, dossierSauvegardes, 'automatique', ctx?.utilisateurId ?? null)
      }
    } catch (erreur) {
      console.error('[pharmina] sauvegarde automatique impossible', erreur)
    }
    terminerSession('arret')
    fermerBase()
  })
}
