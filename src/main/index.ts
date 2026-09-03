import { app, BrowserWindow, shell } from 'electron'
import { dirname, join } from 'node:path'
import { fermerBase } from './db'
import { ouvrirBaseOuSecourir } from './secours'
import { chemins, contexteActuel, enregistrerCanaux, terminerSession } from './ipc'
import { creerSauvegarde } from './services/configuration'
import { parametreBooleen } from './services/commun'
import { rafraichirAlertes } from './services/alertes'
import { definirDossierLicence } from './services/licence'
import { verifier as verifierMiseAJour } from './services/miseAJour'

/**
 * Emplacement des données.
 *
 * Par défaut, le dossier de l'utilisateur : c'est là que vivent les données de
 * l'officine, et elles y survivent à une réinstallation.
 *
 * `PHARMINA_BASE` permet de pointer ailleurs — démonstration commerciale,
 * formation du personnel, reproduction d'un incident au support. Ces
 * instances-là ne doivent jamais écrire dans la base de production, et le
 * script de démonstration utilise déjà la même variable.
 */
const cheminBase =
  process.env.PHARMINA_BASE ?? join(app.getPath('userData'), 'donnees', 'pharmina.db')
const dossierDonnees = process.env.PHARMINA_BASE
  ? dirname(dirname(cheminBase))
  : app.getPath('userData')
const dossierSauvegardes = join(dossierDonnees, 'sauvegardes')

// L'etat de licence est scelle a cote de la cle de la base : effacer la base
// de donnees ne remet donc pas la demonstration a zero.
definirDossierLicence(dirname(cheminBase))

let fenetre: BrowserWindow | null = null

/**
 * Contrôle des mises à jour.
 *
 * Une minute après le démarrage — pas au moment où le pharmacien ouvre son
 * logiciel et attend son écran — puis une fois par jour. Le contrôle est
 * silencieux : il ne télécharge rien, n'affiche aucune fenêtre, et échoue sans
 * bruit si la ligne est coupée. Tout ce qu'il fait, c'est permettre à la barre
 * d'état de mentionner qu'une version existe.
 */
function surveillerLesMisesAJour(): void {
  const UNE_MINUTE = 60_000
  const UN_JOUR = 24 * 60 * UNE_MINUTE

  const controler = (): void => {
    void verifierMiseAJour().catch(() => {
      /* jamais bloquant : une officine hors ligne travaille normalement */
    })
  }

  setTimeout(controler, UNE_MINUTE).unref?.()
  setInterval(controler, UN_JOUR).unref?.()
}

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
    // Une base illisible ne doit jamais refermer le logiciel en silence : le
    // pharmacien double-cliquerait sur l'icône sans que rien ne se passe, sans
    // savoir pourquoi ni quoi faire. Voir secours.ts.
    if (!ouvrirBaseOuSecourir(cheminBase, dossierSauvegardes)) {
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
    surveillerLesMisesAJour()

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
