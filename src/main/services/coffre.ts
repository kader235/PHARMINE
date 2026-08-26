/**
 * Chiffrement des sauvegardes.
 *
 * CE QUE CECI PROTÈGE, ET CE QUE CELA NE PROTÈGE PAS.
 *
 * Une sauvegarde voyage : clé USB, disque externe, dossier réseau, pièce
 * jointe. C'est par là que les données d'une officine sortent réellement —
 * bien plus souvent que par le vol de l'ordinateur lui-même. Un fichier
 * SQLite se lit avec n'importe quel outil gratuit : prix d'achat, marges,
 * fichier clients, chiffre d'affaires, tout est en clair.
 *
 * Les sauvegardes sont donc chiffrées en AES-256-GCM. Sans la clé, le fichier
 * n'est qu'une suite d'octets ; et GCM garantit en plus qu'un fichier modifié
 * est refusé au lieu d'être restauré silencieusement.
 *
 * En revanche, la base VIVANTE — pharmina.db — reste en clair. Le moteur
 * SQLite fourni avec Electron ne sait pas chiffrer, et le vérifier n'est pas
 * une opinion : `PRAGMA key` y est accepté sans effet, ce qui donne
 * l'illusion d'une base protégée alors qu'elle ne l'est pas. Prétendre le
 * contraire serait pire que de ne rien faire. Chiffrer la base elle-même
 * demanderait de remplacer le moteur par SQLCipher, donc une compilation
 * native.
 *
 * LA CLÉ.
 *
 * Elle est tirée au sort à la première sauvegarde et rangée dans la base. Le
 * logiciel restaure donc ses propres sauvegardes sans rien demander. Mais si
 * la machine disparaît, la clé disparaît avec elle : c'est pourquoi elle est
 * affichable et imprimable sous forme de CLÉ DE SECOURS, à conserver hors de
 * l'ordinateur. Sans elle, un disque de sauvegarde retrouvé après un
 * incendie ne servirait à rien.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual
} from 'node:crypto'
import { closeSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs'
import { base } from '../db'
import { ErreurMetier, maintenant } from './commun'

/** En-tête reconnaissable : un fichier chiffré se distingue d'une base en clair. */
const SIGNATURE = Buffer.from('PHARMINA-COFFRE-1\n', 'ascii')
const TAILLE_IV = 12
const TAILLE_MARQUE = 16

/**
 * La clé fait 32 octets tirés au hasard : ce n'est pas un mot de passe, donc
 * aucune dérivation n'est nécessaire. Une fonction de dérivation ne sert qu'à
 * étirer un secret faible, et en ajouter un ici n'apporterait qu'un risque
 * d'erreur supplémentaire.
 */
const TAILLE_CLE = 32

/** Clé de l'officine, créée au premier besoin. */
export function cleMaitresse(): Buffer {
  const ligne = base()
    .prepare("SELECT valeur FROM parametres WHERE cle = 'securite.cle_sauvegarde'")
    .get() as unknown as { valeur: string | null } | undefined

  if (ligne?.valeur) {
    const cle = Buffer.from(ligne.valeur, 'base64')
    if (cle.length === TAILLE_CLE) return cle
  }

  const nouvelle = randomBytes(TAILLE_CLE)
  base()
    .prepare(
      `INSERT INTO parametres (cle, valeur, type, categorie, libelle, description, updated_at)
       VALUES ('securite.cle_sauvegarde', ?, 'texte', 'securite',
               'Clé de chiffrement des sauvegardes',
               'Créée automatiquement. Notez la clé de secours hors de cet ordinateur.', ?)
       ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur, updated_at = excluded.updated_at`
    )
    .run(nouvelle.toString('base64'), maintenant())

  return nouvelle
}

/**
 * Alphabet de Crockford : base 32 sans I, L, O ni U.
 *
 * Une clé de secours se recopie à la main sur un papier rangé dans un coffre.
 * Le base64 ne convient pas — il distingue les majuscules des minuscules, et
 * une clé recopiée en capitales devient illisible. Ici, la casse n'a pas
 * d'importance, et les caractères qu'on confond en écrivant sont exclus :
 * un « O » se relit comme un zéro, un « I » comme un 1.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function encoderBase32(octets: Buffer): string {
  let tampon = 0
  let bits = 0
  let sortie = ''

  for (const octet of octets) {
    tampon = (tampon << 8) | octet
    bits += 8
    while (bits >= 5) {
      sortie += ALPHABET[(tampon >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) sortie += ALPHABET[(tampon << (5 - bits)) & 31]

  return sortie
}

function decoderBase32(texte: string): Buffer {
  let tampon = 0
  let bits = 0
  const octets: number[] = []

  for (const caractere of texte) {
    // Les confusions courantes de l'écriture manuscrite sont rattrapées.
    const normalise = caractere.toUpperCase().replace(/[IL]/, '1').replace(/O/, '0')
    const valeur = ALPHABET.indexOf(normalise)
    if (valeur < 0) throw new ErreurMetier(`Caractère inattendu dans la clé : « ${caractere} ».`, 'cle')

    tampon = (tampon << 5) | valeur
    bits += 5
    if (bits >= 8) {
      octets.push((tampon >>> (bits - 8)) & 255)
      bits -= 8
    }
  }

  return Buffer.from(octets)
}

/**
 * Clé de secours, en groupes de quatre.
 *
 * Découpée pour être recopiée sans erreur : c'est un papier rangé dans un
 * coffre, pas une chaîne à copier-coller.
 */
export function cleDeSecours(): string {
  return (encoderBase32(cleMaitresse()).match(/.{1,4}/g) ?? []).join('-')
}

/** Relit une clé de secours saisie à la main, tolérante à la mise en forme. */
export function cleDepuisSecours(saisie: string): Buffer {
  const nettoye = saisie.replace(/[\s-]/g, '')
  if (!nettoye) throw new ErreurMetier('Aucune clé de secours saisie.', 'cle')

  const cle = decoderBase32(nettoye).subarray(0, TAILLE_CLE)

  if (cle.length !== TAILLE_CLE) {
    throw new ErreurMetier(
      `Cette clé de secours est incomplète (${cle.length} octets sur ${TAILLE_CLE}).`,
      'cle'
    )
  }
  return cle
}

/** Vrai si le fichier porte la signature d'une sauvegarde chiffrée. */
export function estChiffre(fichier: string): boolean {
  let descripteur: number | null = null
  try {
    descripteur = openSync(fichier, 'r')
    const debut = Buffer.alloc(SIGNATURE.length)
    const lus = readSync(descripteur, debut, 0, SIGNATURE.length, 0)
    return lus === SIGNATURE.length && debut.equals(SIGNATURE)
  } catch {
    return false
  } finally {
    if (descripteur !== null) closeSync(descripteur)
  }
}

export function chiffrerFichier(source: string, destination: string, cle: Buffer): void {
  const clair = readFileSync(source)
  const iv = randomBytes(TAILLE_IV)
  const chiffreur = createCipheriv('aes-256-gcm', cle, iv)

  // La signature est authentifiée avec le contenu : modifier l'en-tête pour
  // faire passer un fichier pour un autre invalide le déchiffrement.
  chiffreur.setAAD(SIGNATURE)

  const chiffre = Buffer.concat([chiffreur.update(clair), chiffreur.final()])
  writeFileSync(destination, Buffer.concat([SIGNATURE, iv, chiffreur.getAuthTag(), chiffre]))
}

export function dechiffrerFichier(source: string, destination: string, cle: Buffer): void {
  const brut = readFileSync(source)
  const entete = SIGNATURE.length

  if (brut.length < entete + TAILLE_IV + TAILLE_MARQUE || !brut.subarray(0, entete).equals(SIGNATURE)) {
    throw new ErreurMetier('Ce fichier n’est pas une sauvegarde PHARMINA chiffrée.', 'fichier')
  }

  const iv = brut.subarray(entete, entete + TAILLE_IV)
  const marque = brut.subarray(entete + TAILLE_IV, entete + TAILLE_IV + TAILLE_MARQUE)
  const chiffre = brut.subarray(entete + TAILLE_IV + TAILLE_MARQUE)

  const dechiffreur = createDecipheriv('aes-256-gcm', cle, iv)
  dechiffreur.setAAD(SIGNATURE)
  dechiffreur.setAuthTag(marque)

  try {
    writeFileSync(destination, Buffer.concat([dechiffreur.update(chiffre), dechiffreur.final()]))
  } catch {
    // GCM refuse aussi bien une mauvaise clé qu'un fichier abîmé : on ne peut
    // pas distinguer les deux, et c'est voulu.
    throw new ErreurMetier(
      'Déchiffrement impossible : la clé ne correspond pas, ou le fichier a été modifié.',
      'cle'
    )
  }
}

/** Compare deux clés sans laisser fuir d'information par le temps de calcul. */
export function memeCle(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b)
}
