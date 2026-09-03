/**
 * Ce qui se passe quand la base ne s'ouvre pas.
 *
 * LE DÉFAUT QU'ON CORRIGE ICI
 *
 * Jusqu'ici, une base illisible écrivait une ligne dans une console que
 * personne ne lit, et le logiciel se refermait. Le pharmacien double-cliquait
 * sur l'icône et il ne se passait rien. Rien du tout : ni message, ni cause,
 * ni recours. L'officine était à l'arrêt sans savoir pourquoi.
 *
 * Or les causes sont banales et fréquentes sur les postes réels :
 *
 *   — un antivirus met le fichier en quarantaine, ou le verrouille ;
 *   — une coupure de courant pendant une écriture ;
 *   — un disque qui commence à lâcher ;
 *   — un rançongiciel qui chiffre tout ce qu'il trouve ;
 *   — Windows réinstallé, ou le compte utilisateur recréé — le sceau ne
 *     s'ouvre plus.
 *
 * Dans tous ces cas la réponse est la même et elle existe déjà : restaurer la
 * dernière sauvegarde. Encore faut-il la proposer.
 *
 * CE QU'ON NE FAIT JAMAIS
 *
 * Effacer la base illisible. Elle est mise de côté, datée, jamais supprimée :
 * un fichier abîmé se répare parfois, et c'est la seule chose qui reste quand
 * les sauvegardes manquent aussi.
 */
import { dialog, shell } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { ouvrirBase, scellerPourCePoste } from './db'
import { controlerSauvegarde, ouvrirSauvegarde } from './services/configuration'

/** Les sauvegardes du dossier, la plus récente d'abord. */
export function sauvegardesDisponibles(dossier: string): { fichier: string; at: Date }[] {
  if (!existsSync(dossier)) return []
  try {
    return readdirSync(dossier)
      .filter((f) => f.endsWith('.pharmina') || f.endsWith('.db'))
      .map((f) => {
        const chemin = join(dossier, f)
        return { fichier: chemin, at: statSync(chemin).mtime }
      })
      .sort((a, b) => b.at.getTime() - a.at.getTime())
  } catch {
    return []
  }
}

/**
 * Remet une sauvegarde en place, sans base ouverte.
 *
 * La restauration ordinaire journalise et prend une copie de sécurité ; elle a
 * besoin d'une base saine. Ici il n'y en a pas : on fait le strict nécessaire,
 * et l'ancienne base est mise de côté plutôt qu'écrasée.
 */
export function restaurerEnUrgence(fichier: string, cheminBase: string): void {
  const ouverte = ouvrirSauvegarde(fichier)
  try {
    if (existsSync(cheminBase)) {
      const horodatage = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      renameSync(cheminBase, `${cheminBase}.illisible-${horodatage}`)
    }
    // Les fichiers voisins décrivent l'ancienne base : les laisser mélangerait
    // deux histoires au prochain démarrage.
    for (const reste of [`${cheminBase}-wal`, `${cheminBase}-shm`]) {
      rmSync(reste, { force: true })
    }

    mkdirSync(dirname(cheminBase), { recursive: true })
    copyFileSync(ouverte.chemin, cheminBase)

    // La sauvegarde vient peut-être d'un autre ordinateur : elle est remise
    // sous la clé de celui-ci, sans quoi elle ne s'ouvrirait pas non plus.
    scellerPourCePoste(cheminBase, dirname(cheminBase))
  } finally {
    if (ouverte.temporaire) rmSync(ouverte.chemin, { force: true })
  }
}

/**
 * Ouvre la base, ou accompagne le pharmacien jusqu'à une base ouverte.
 *
 * Renvoie `true` si le logiciel peut démarrer.
 */
export function ouvrirBaseOuSecourir(cheminBase: string, dossierSauvegardes: string): boolean {
  try {
    ouvrirBase(cheminBase)
    return true
  } catch (erreur) {
    console.error('[pharmina] ouverture de la base impossible', erreur)
    return proposerSecours(cheminBase, dossierSauvegardes, (erreur as Error).message)
  }
}

function proposerSecours(cheminBase: string, dossierSauvegardes: string, motif: string): boolean {
  const sauvegardes = sauvegardesDisponibles(dossierSauvegardes)

  // On ne propose que des sauvegardes réellement lisibles : annoncer une
  // restauration qui échouera ensuite serait pire que de ne rien proposer.
  const utilisable = sauvegardes.find((s) => controlerSauvegarde(s.fichier).valide)

  const causes =
    'Trois causes possibles, de la plus fréquente à la plus rare :\n\n' +
    '  •  un antivirus a mis le fichier en quarantaine, ou le bloque ;\n' +
    '  •  une coupure de courant, ou un disque qui faiblit, l’a abîmé ;\n' +
    '  •  Windows a été réinstallé : les données de cet ordinateur ne\n' +
    '     s’ouvrent plus ici.\n\n' +
    'Vos données ne sont pas effacées. Le fichier est conservé tel quel.'

  if (!utilisable) {
    const reponse = dialog.showMessageBoxSync({
      type: 'error',
      title: 'PHARMINA ne peut pas ouvrir vos données',
      message: 'PHARMINA ne peut pas ouvrir vos données, et aucune sauvegarde utilisable n’a été trouvée.',
      detail: `${causes}\n\nAppelez votre fournisseur avant toute autre manipulation.\n\nDétail technique : ${motif}`,
      buttons: ['Ouvrir le dossier des données', 'Quitter'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    })
    if (reponse === 0) void shell.openPath(dirname(cheminBase))
    return false
  }

  const age = Math.round((Date.now() - utilisable.at.getTime()) / 3_600_000)
  const anciennete =
    age < 1 ? 'de moins d’une heure' : age < 48 ? `d’il y a ${age} heure${age > 1 ? 's' : ''}` : `d’il y a ${Math.round(age / 24)} jours`

  const choix = dialog.showMessageBoxSync({
    type: 'warning',
    title: 'PHARMINA ne peut pas ouvrir vos données',
    message: 'PHARMINA ne peut pas ouvrir vos données.',
    detail:
      `${causes}\n\n` +
      `Une sauvegarde ${anciennete} est disponible :\n${basename(utilisable.fichier)}\n\n` +
      'La restaurer remettra l’officine en marche. Les ventes enregistrées après\n' +
      'cette sauvegarde devront être ressaisies.',
    buttons: ['Restaurer cette sauvegarde', 'Ouvrir le dossier des données', 'Quitter'],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  })

  if (choix === 1) {
    void shell.openPath(dossierSauvegardes)
    return false
  }
  if (choix !== 0) return false

  try {
    restaurerEnUrgence(utilisable.fichier, cheminBase)
    ouvrirBase(cheminBase)
  } catch (erreur) {
    const reponse = dialog.showMessageBoxSync({
      type: 'error',
      title: 'La restauration a échoué',
      message: 'La restauration a échoué.',
      detail:
        `${(erreur as Error).message}\n\n` +
        'Votre fichier d’origine est conservé, renommé, dans le dossier des\n' +
        'données. N’effacez rien et appelez votre fournisseur.',
      buttons: ['Ouvrir le dossier des données', 'Quitter'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    })
    if (reponse === 0) void shell.openPath(dirname(cheminBase))
    return false
  }

  dialog.showMessageBoxSync({
    type: 'info',
    title: 'Données restaurées',
    message: 'Vos données ont été restaurées.',
    detail:
      `Sauvegarde utilisée : ${basename(utilisable.fichier)}\n\n` +
      'Vérifiez vos dernières ventes et votre stock avant de reprendre le\n' +
      'comptoir. L’ancien fichier a été conservé, renommé, à côté de la base.',
    buttons: ['Continuer'],
    noLink: true
  })

  return true
}
