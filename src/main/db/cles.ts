/**
 * Les deux clés du logiciel.
 *
 * Elles répondent à deux besoins opposés, et c'est pour cela qu'il en faut
 * deux.
 *
 * 1. LA CLÉ DU POSTE protège la base vivante. Elle est propre à cet
 *    ordinateur et à cette session Windows : le fichier `pharmina.db` copié
 *    sur une clé USB, envoyé par courriel ou monté depuis un autre système
 *    n'est plus qu'une suite d'octets. Ni lisible, ni modifiable — et une
 *    base trafiquée ne s'ouvre pas du tout au lieu de mentir en silence.
 *
 * 2. LA CLÉ DU LOGICIEL protège les sauvegardes. Une sauvegarde doit pouvoir
 *    repartir sur un autre ordinateur — c'est tout son objet : le poste a
 *    brûlé, on en installe un neuf, on restaure. Elle est donc chiffrée avec
 *    une clé que toute installation de PHARMINA connaît, et par personne
 *    d'autre. Le pharmacien n'a rien à saisir, rien à noter, rien à perdre.
 *
 * CE QUE CELA ARRÊTE, ET CE QUE CELA N'ARRÊTE PAS.
 *
 * Un disque volé, un fichier recopié, une base ouverte dans un outil tiers :
 * arrêtés. Une modification directe des ventes pour masquer un manquant en
 * caisse : arrêtée.
 *
 * En revanche, la clé du logiciel voyage forcément à l'intérieur du logiciel.
 * Quelqu'un d'assez outillé pour désassembler le programme finira par
 * l'extraire, et pourra alors ouvrir une sauvegarde. C'est le prix du
 * « l'utilisateur ne fait rien » : la seule façon de fermer cette porte serait
 * un mot de passe tapé par un humain, donc un mot de passe que le pharmacien
 * peut oublier un lundi matin. Le choix est assumé, il doit être connu.
 */
import { createHash, hkdfSync, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, hostname, userInfo } from 'node:os'
import { join } from 'node:path'
import { safeStorage } from 'electron'

const TAILLE_CLE = 32

/** Fichier où dort la clé du poste, scellée par Windows. */
const NOM_SCEAU = 'cle-poste.scelle'

/**
 * Secret du logiciel.
 *
 * Tiré au sort une fois, à la conception. Il ne protège pas d'un examen du
 * binaire — voir l'avertissement en tête de fichier — mais il garantit qu'une
 * sauvegarde n'est exploitable que dans PHARMINA, ce qui est précisément ce
 * qui est demandé.
 */
const SECRET_LOGICIEL = Buffer.from(
  'fccc0d80ec762782627781e40e761e18ef01382d02d17383db35906a1487f69d',
  'hex'
)

/**
 * Clé de secours si Windows refuse de sceller.
 *
 * `safeStorage` s'appuie sur DPAPI et fonctionne sur toute installation
 * ordinaire. S'il venait à manquer — session inhabituelle, système bridé — on
 * ne se rabat pas sur une base en clair : on dérive une clé des
 * caractéristiques de la machine. C'est plus faible qu'un scellé DPAPI, car un
 * attaquant qui connaît ces caractéristiques peut la recalculer ; c'est
 * infiniment mieux qu'un fichier lisible au bloc-notes.
 */
function cleDeSecoursMachine(): Buffer {
  // Rien qui vienne d'Electron : cette fonction doit répondre même hors de
  // l'application — bancs d'essai, outils en ligne de commande.
  const empreinte = [
    hostname(),
    userInfo().username,
    homedir(),
    process.env.COMPUTERNAME ?? '',
    process.env.USERDOMAIN ?? ''
  ].join(' ')

  return createHash('sha256').update('PHARMINA-poste ' + empreinte).digest()
}

/**
 * Clé de la base de cette officine, sur cet ordinateur.
 *
 * Créée au premier lancement, scellée par Windows au compte qui l'a créée.
 * Recopier `pharmina.db` ET `cle-poste.scelle` sur une autre machine ne sert
 * à rien : le sceau ne s'ouvre que là où il a été posé.
 */
export function cleDuPoste(dossier: string): Buffer {
  mkdirSync(dossier, { recursive: true })
  const sceau = join(dossier, NOM_SCEAU)

  if (existsSync(sceau)) {
    const scelle = readFileSync(sceau)
    try {
      const cle = Buffer.from(safeStorage!.decryptString(scelle), 'hex')
      if (cle.length === TAILLE_CLE) return cle
    } catch {
      // Sceau posé par une autre machine ou un autre compte : c'est
      // exactement le cas qu'on veut refuser. On tente la dérivation locale,
      // qui échouera aussi si la base vient d'ailleurs — et c'est voulu.
    }
    return cleDeSecoursMachine()
  }

  const cle = randomBytes(TAILLE_CLE)
  try {
    if (!scellementDisponible()) throw new Error('scellement indisponible')
    writeFileSync(sceau, safeStorage!.encryptString(cle.toString('hex')))
    return cle
  } catch {
    // Sans scellement possible, la clé dérivée de la machine est reproductible
    // au prochain démarrage : on ne l'écrit donc nulle part.
    return cleDeSecoursMachine()
  }
}

/**
 * Clé d'une sauvegarde.
 *
 * Dérivée du secret du logiciel et d'un sel tiré au sort pour chaque fichier :
 * deux sauvegardes du même contenu ne se ressemblent pas, et compromettre
 * l'une n'aide pas à ouvrir l'autre.
 */
export function cleDeSauvegarde(sel: Buffer): Buffer {
  return Buffer.from(
    hkdfSync('sha256', SECRET_LOGICIEL, sel, Buffer.from('PHARMINA-sauvegarde'), TAILLE_CLE)
  )
}

export const TAILLE_SEL = 16

export function nouveauSel(): Buffer {
  return randomBytes(TAILLE_SEL)
}

/** Vrai si Windows scelle réellement la clé, faux si l'on s'est rabattu. */
export function scellementDisponible(): boolean {
  try {
    return !!safeStorage && safeStorage.isEncryptionAvailable()
  } catch {
    // Hors application Electron — bancs d'essai, outils en ligne de commande.
    return false
  }
}
