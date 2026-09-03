/**
 * Mises à jour du logiciel.
 *
 * CE QUI A GUIDÉ LA CONCEPTION.
 *
 * Les officines visées n'ont pas toutes une connexion, et celles qui en ont une
 * la paient au mégaoctet. Trois conséquences, toutes assumées ici :
 *
 * 1. RIEN NE S'IMPOSE. Le logiciel regarde s'il existe une version plus
 *    récente, le dit, et attend. Il ne télécharge pas de sa propre initiative,
 *    il ne redémarre jamais l'application au milieu d'une vente. Un pharmacien
 *    qui sert un client ne doit pas voir son écran changer.
 *
 * 2. LE TÉLÉCHARGEMENT EST DIFFÉRENTIEL. L'installateur pèse cent mégaoctets,
 *    mais deux versions successives ne diffèrent que de quelques-uns.
 *    `electron-updater` s'appuie sur le fichier `.blockmap` produit à côté de
 *    l'installateur pour ne récupérer que les blocs modifiés.
 *
 * 3. L'ABSENCE DE RÉSEAU N'EST PAS UNE ERREUR. Aucune officine ne doit voir un
 *    message d'échec parce que sa ligne est coupée. Le contrôle échoue en
 *    silence et le logiciel continue — la clé USB reste un chemin valable.
 *
 * CE QUE CELA NE FAIT PAS.
 *
 * Sans certificat de signature de code, Windows ne peut pas vérifier l'origine
 * du fichier téléchargé. Quelqu'un qui détournerait la liaison pourrait pousser
 * un faux installateur. Le jour où le certificat sera acquis, cette vérification
 * deviendra automatique — c'est le même achat qui fait taire SmartScreen.
 */
import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

import { journaliser } from './commun'

/** Version du produit, injectee a la compilation depuis package.json. */
declare const __VERSION_PHARMINA__: string

export interface EtatMiseAJour {
  versionInstallee: string
  /** Version disponible en ligne, si elle est plus récente. */
  versionDisponible: string | null
  notes: string | null
  /** Progression du téléchargement, de 0 à 100. */
  progression: number | null
  prete: boolean
  /** Dernier motif d'échec, pour l'écran des paramètres. Jamais bloquant. */
  motif: string | null
  verifieLe: string | null
}

let etatCourant: EtatMiseAJour = {
  // Pas `app.getVersion()` : hors application empaquetee, il renvoie la
  // version d'Electron. Le pharmacien lirait « 41.10.7 » au lieu de la sienne.
  versionInstallee: __VERSION_PHARMINA__,
  versionDisponible: null,
  notes: null,
  progression: null,
  prete: false,
  motif: null,
  verifieLe: null
}

/**
 * Met les notes de version en texte lisible.
 *
 * CE QU'ON A VU EN VRAI
 *
 * La 0.1.2 s'est annoncee au comptoir avec des « <p> » et des « <br /> » en
 * clair, et le contenu d'un journal de developpeur : « 325 verifications
 * metier, 18 invariants de schema ». Un pharmacien de N'Djamena n'a rien a
 * faire de cela, et des balises brutes donnent l'impression d'un logiciel
 * casse.
 *
 * Ces notes viennent d'un texte libre, ecrit a la main, publie sur GitHub.
 * Elles peuvent contenir n'importe quoi — du HTML, du Markdown, une ligne de
 * signature automatique. On ne les affiche donc jamais telles quelles :
 *
 *   — les balises sont retirees, et les sauts de ligne qu'elles portaient
 *     deviennent de vrais sauts de ligne ;
 *   — les entites HTML sont decodees, sinon « &lt; » resterait tel quel ;
 *   — les lignes de plomberie — signatures, co-auteurs — sont ecartees ;
 *   — le tout est plafonne : ce panneau annonce une nouveaute, il ne raconte
 *     pas l'histoire du logiciel.
 *
 * Ce nettoyage est un filet, pas la solution : la vraie reponse est d'ecrire
 * des notes destinees au pharmacien, ce que fait desormais NOUVEAUTES.md.
 */
export function notesLisibles(brut: string | null | undefined): string | null {
  if (!brut) return null

  // Deux etapes, dans cet ordre precis. Le retrait des balises d'abord, le
  // decodage des entites ensuite : l'inverse transformerait « &lt;p&gt; » en
  // une vraie balise, qu'on retirerait alors sans le vouloir — et un texte
  // parlant legitimement de balises se viderait.
  const sansBalises = brut
    // Les balises de bloc portent le saut de ligne : le perdre collerait
    // toutes les phrases en un seul pave.
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')

  // Un chevron survivant ici signale un balisage qu'on n'a pas su lire. Le
  // controle a lieu AVANT le decodage : sinon « Prix &lt; 500 F », qui est un
  // texte parfaitement legitime, serait refuse.
  if (sansBalises.includes('<')) return null

  const texte = sansBalises
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // L'esperluette en dernier : la decoder d'abord recreerait les autres.
    .replace(/&amp;/g, '&')

  // La presence d'une signature de depot PROUVE qu'on lit un message de
  // commit, pas une note ecrite pour le pharmacien. On refuse alors le tout
  // plutot que d'en retirer la ligne : le reste serait du meme tonneau.
  if (/co-authored-by|signed-off-by|generated with \[claude/i.test(texte)) return null

  const lignes = texte
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  if (!lignes.length) return null

  // Une balise survivante, une ligne interminable, un pave de vingt lignes :
  // autant de signes qu'on n'a pas affaire a un texte destine au comptoir.
  // Mieux vaut ne rien annoncer qu'annoncer n'importe quoi devant un client.
  if (lignes.some((l) => l.length > 200)) return null
  if (lignes.length > 10) return null

  const assemble = lignes.join('\n')
  return assemble.length > 600 ? null : assemble
}

let dejaConfigure = false

function configurer(): void {
  if (dejaConfigure) return
  dejaConfigure = true

  // Rien ne se déclenche tout seul : ni le téléchargement, ni l'installation.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (info) => {
    etatCourant = {
      ...etatCourant,
      versionDisponible: info.version,
      notes: notesLisibles(typeof info.releaseNotes === 'string' ? info.releaseNotes : null),
      motif: null
    }
  })

  autoUpdater.on('update-not-available', () => {
    etatCourant = { ...etatCourant, versionDisponible: null, motif: null }
  })

  autoUpdater.on('download-progress', (p) => {
    etatCourant = { ...etatCourant, progression: Math.round(p.percent) }
  })

  autoUpdater.on('update-downloaded', (info) => {
    etatCourant = { ...etatCourant, progression: 100, prete: true }
    journaliser({
      utilisateurId: null,
      action: 'Mise à jour téléchargée',
      entite: 'logiciel',
      resume: `version ${info.version}`
    })
  })

  autoUpdater.on('error', (erreur) => {
    // Ligne coupée, serveur injoignable, version non publiée : aucun de ces cas
    // n'est une panne du logiciel de l'officine — et aucun ne regarde le
    // pharmacien. Le message brut cite des adresses et des codes qui ne lui
    // apprennent rien et l'inquiètent pour rien.
    etatCourant = { ...etatCourant, motif: enClairPourLUtilisateur(erreur), progression: null }
  })
}

/**
 * Traduit une panne technique en phrase utile.
 *
 * L'utilisateur n'a pas à lire une adresse de serveur ni un code d'erreur. Il a
 * besoin de savoir une seule chose : est-ce que ça vient de lui, et que faire.
 */
function enClairPourLUtilisateur(erreur: Error): string {
  const brut = (erreur.message ?? '').toLowerCase()

  if (/enotfound|eai_again|getaddrinfo|econnrefused|network|timed? ?out|etimedout/.test(brut)) {
    return 'Pas de connexion Internet pour le moment. Vous pouvez continuer à travailler normalement.'
  }
  if (/404|no published versions|cannot find/.test(brut)) {
    return 'Aucune nouvelle version n’est proposée pour l’instant.'
  }
  if (/eacces|eperm|permission/.test(brut)) {
    return 'Le logiciel n’a pas les droits nécessaires. Demandez à la personne qui gère l’ordinateur.'
  }
  return 'La vérification n’a pas abouti. Réessayez plus tard, ou contactez votre fournisseur.'
}

/** Interroge le dépôt. Ne lève jamais : l'absence de réseau n'est pas une erreur. */
export async function verifier(): Promise<EtatMiseAJour> {
  configurer()
  etatCourant = { ...etatCourant, verifieLe: new Date().toISOString() }

  // En développement, `electron-updater` refuse de travailler faute
  // d'application installée. On le dit plutôt que de laisser une erreur brute.
  if (!app.isPackaged) {
    etatCourant = {
      ...etatCourant,
      motif: 'Les mises à jour sont disponibles une fois le logiciel installé.'
    }
    return etatCourant
  }

  try {
    await autoUpdater.checkForUpdates()
  } catch (erreur) {
    etatCourant = { ...etatCourant, motif: enClairPourLUtilisateur(erreur as Error) }
  }
  return etatCourant
}

/** Télécharge la version disponible, à la demande explicite de l'utilisateur. */
export async function telecharger(): Promise<EtatMiseAJour> {
  configurer()
  if (!etatCourant.versionDisponible) return etatCourant

  try {
    etatCourant = { ...etatCourant, progression: 0, motif: null }
    await autoUpdater.downloadUpdate()
  } catch (erreur) {
    etatCourant = { ...etatCourant, motif: enClairPourLUtilisateur(erreur as Error), progression: null }
  }
  return etatCourant
}

/**
 * Installe et redémarre.
 *
 * Volontairement séparé du téléchargement : on télécharge quand la connexion
 * est là, on installe quand le comptoir est vide. Ce n'est pas au logiciel de
 * décider du moment.
 */
export function installer(): void {
  if (!etatCourant.prete) return
  autoUpdater.quitAndInstall(false, true)
}

export function etat(): EtatMiseAJour {
  return etatCourant
}
