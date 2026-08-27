/**
 * Licences et mode démonstration.
 *
 * Le logiciel s'installe en démonstration. Il fonctionne : on crée son
 * catalogue, on reçoit des marchandises, on vend, on tient sa caisse, on
 * consulte ses clients. C'est volontaire — une démonstration qui ne laisse
 * rien faire ne démontre rien, et un pharmacien qui ne peut pas essayer
 * n'achète pas.
 *
 * Elle s'arrête là où commence l'exploitation quotidienne : dix ventes par
 * jour, pas de rapports, pas d'export. De quoi se convaincre, pas de quoi
 * tenir une officine.
 *
 * L'HORLOGE.
 *
 * Reculer la date de l'ordinateur est le contournement évident, et il ne
 * fonctionne pas : le logiciel retient la date la plus avancée qu'il ait
 * jamais vue. Si l'horloge revient en arrière, c'est cette date-là qui fait
 * foi — la journée ne recommence pas. Le repère vit dans un fichier scellé
 * par Windows, à côté de la clé de la base : effacer la base de données ne le
 * remet pas à zéro, et le modifier à la main le rend illisible.
 *
 * Avancer l'horloge ouvre bien une nouvelle journée — c'est inévitable hors
 * ligne — mais chaque saut est compté et affiché. Quelqu'un qui change la date
 * de son ordinateur tous les jours pour gagner dix ventes fait un travail
 * manuel répété ; à ce stade, acheter la licence coûte moins cher.
 *
 * LES LICENCES.
 *
 * Elles sont signées en Ed25519. Le logiciel ne contient que la clé PUBLIQUE :
 * on peut le désassembler entièrement sans pouvoir fabriquer une licence. La
 * clé privée reste chez l'éditeur, et n'est jamais livrée.
 *
 * Une licence est liée au poste : elle porte la signature de l'empreinte de
 * l'ordinateur. Recopiée sur une autre machine, elle est refusée.
 */
import { createHash, createPublicKey, verify } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, hostname, userInfo } from 'node:os'
import { join } from 'node:path'
import { safeStorage } from 'electron'

import { ErreurMetier, aujourdhui, journaliser, maintenant } from './commun'

/**
 * Journalise sans jamais faire échouer l'appelant.
 *
 * L'écran d'activation peut s'afficher avant qu'une base soit ouverte —
 * première installation, base restaurée, licence expirée. Une trace manquante
 * n'est pas une raison de refuser l'activation à quelqu'un qui vient de payer.
 */
function tracer(entree: Parameters<typeof journaliser>[0]): void {
  try {
    journaliser(entree)
  } catch {
    /* base pas encore ouverte */
  }
}

/** Clé publique de l'éditeur. La privée n'est jamais livrée avec le logiciel. */
const CLE_PUBLIQUE = createPublicKey({
  key: Buffer.from(
    '302a300506032b65700321008ad2f37829875c3f75d6c4c97f7a11af705b85b8bdbe150e21fd5d284faa3dac',
    'hex'
  ),
  format: 'der',
  type: 'spki'
})

/** Ventes autorisées par journée en démonstration. */
export const VENTES_PAR_JOUR_DEMO = 10

/** Origine des dates d'expiration, pour tenir sur deux octets. */
const ORIGINE = Date.UTC(2026, 0, 1)

const NOM_ETAT = 'licence.scelle'

// ---------------------------------------------------------------------------
// Empreinte du poste
// ---------------------------------------------------------------------------

/**
 * Ce qui identifie cet ordinateur.
 *
 * Les mêmes éléments que la clé de secours de la base : nom de machine,
 * compte Windows, dossier personnel. Stable d'un démarrage à l'autre, différent
 * d'un poste à l'autre.
 */
function empreinteComplete(): Buffer {
  const elements = [
    hostname(),
    userInfo().username,
    homedir(),
    process.env.COMPUTERNAME ?? '',
    process.env.USERDOMAIN ?? ''
  ].join(' ')

  return createHash('sha256').update('PHARMINA-poste ' + elements).digest()
}

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function base32(octets: Buffer): string {
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

function debase32(texte: string): Buffer {
  let tampon = 0
  let bits = 0
  const octets: number[] = []

  for (const caractere of texte) {
    const normalise = caractere.toUpperCase().replace(/[IL]/, '1').replace(/O/, '0')
    const valeur = ALPHABET.indexOf(normalise)
    if (valeur < 0) throw new ErreurMetier(`Caractère inattendu : « ${caractere} ».`, 'licence')

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
 * Empreinte retenue : dix octets, quatre-vingts bits.
 *
 * Assez pour qu'aucune officine ne partage l'empreinte d'une autre, assez court
 * pour se dicter au téléphone en seize caractères. C'est exactement ce que la
 * licence signe.
 */
function empreintePoste(): Buffer {
  return empreinteComplete().subarray(0, 10)
}

/**
 * Code d'installation à communiquer à l'éditeur.
 *
 * Court, en groupes de quatre, lisible au téléphone : c'est ce que le
 * pharmacien dicte ou recopie dans un message.
 */
export function codeInstallation(): string {
  return (base32(empreintePoste()).match(/.{1,4}/g) ?? []).join('-')
}

// ---------------------------------------------------------------------------
// État scellé
// ---------------------------------------------------------------------------

interface EtatScelle {
  /** Date la plus avancée jamais observée, au format AAAA-MM-JJ. */
  jourMax: string
  /** Nombre de fois où l'horloge a reculé. */
  reculs: number
  /** Nombre de sauts en avant de plus d'un jour. */
  bonds: number
  /** Licence enregistrée, si le poste est activé. */
  licence: string | null
  installeLe: string
}

let dossierEtat = ''

export function definirDossierLicence(dossier: string): void {
  dossierEtat = dossier
}

function etatNeuf(): EtatScelle {
  return { jourMax: aujourdhui(), reculs: 0, bonds: 0, licence: null, installeLe: maintenant() }
}

function lireEtat(): EtatScelle {
  const fichier = join(dossierEtat, NOM_ETAT)
  if (!existsSync(fichier)) return etatNeuf()

  try {
    const brut = readFileSync(fichier)
    const texte = safeStorage?.isEncryptionAvailable()
      ? safeStorage.decryptString(brut)
      : brut.toString('utf8')
    return { ...etatNeuf(), ...(JSON.parse(texte) as EtatScelle) }
  } catch {
    // Fichier abîmé ou déplacé depuis un autre poste : on repart d'un état
    // neuf plutôt que d'empêcher le logiciel de démarrer. Le pire cas est une
    // journée de démonstration offerte, pas une officine bloquée.
    return etatNeuf()
  }
}

function ecrireEtat(etat: EtatScelle): void {
  if (!dossierEtat) return
  const fichier = join(dossierEtat, NOM_ETAT)
  const texte = JSON.stringify(etat)

  try {
    writeFileSync(
      fichier,
      safeStorage?.isEncryptionAvailable() ? safeStorage.encryptString(texte) : Buffer.from(texte)
    )
  } catch {
    // Un état non enregistré n'empêche pas de travailler.
  }
}

// ---------------------------------------------------------------------------
// Horloge non réversible
// ---------------------------------------------------------------------------

/**
 * Le jour retenu par le logiciel.
 *
 * Ce n'est pas forcément celui de l'horloge : c'est le plus avancé des deux.
 * Reculer la date ne fait donc pas revenir la veille.
 *
 * `horlogeDuJour` n'existe que pour éprouver ce comportement : une protection
 * contre le recul de l'horloge qu'on ne peut pas tester en reculant l'horloge
 * ne serait qu'une intention.
 */
export function jourEffectif(horlogeDuJour = aujourdhui()): string {
  const etat = lireEtat()
  const horloge = horlogeDuJour

  if (horloge > etat.jourMax) {
    const ecart = Math.round(
      (new Date(horloge).getTime() - new Date(etat.jourMax).getTime()) / 86_400_000
    )
    ecrireEtat({ ...etat, jourMax: horloge, bonds: etat.bonds + (ecart > 1 ? 1 : 0) })
    return horloge
  }

  if (horloge < etat.jourMax) {
    ecrireEtat({ ...etat, reculs: etat.reculs + 1 })
    return etat.jourMax
  }

  return etat.jourMax
}

// ---------------------------------------------------------------------------
// Licences
// ---------------------------------------------------------------------------

/**
 * Contenu signé d'une licence.
 *
 * Trois octets seulement, plus la signature : la validité ne se lit pas dans
 * la licence, elle se prouve. L'empreinte du poste n'y figure pas — elle est
 * signée AVEC, et recalculée localement.
 */
interface Contenu {
  version: number
  /** Jours depuis le 1er janvier 2026. Zéro = licence perpétuelle. */
  expiration: number
  options: number
}

function messageSigne(contenu: Contenu, empreinte: Buffer): Buffer {
  const entete = Buffer.from([contenu.version, contenu.expiration >> 8, contenu.expiration & 255, contenu.options])
  return Buffer.concat([Buffer.from('PHARMINA-LICENCE-1'), entete, empreinte])
}

export interface EtatLicence {
  activee: boolean
  codeInstallation: string
  expiration: string | null
  joursRestants: number | null
  /** Ventes déjà enregistrées aujourd'hui, au sens du jour effectif. */
  ventesDuJour: number
  ventesMaximum: number
  jourEffectif: string
  /** Vrai si l'horloge du poste a été reculée au moins une fois. */
  horlogeSuspecte: boolean
  reculs: number
  bonds: number
}

/** Vérifie une licence et rend son contenu, ou null si elle ne vaut rien. */
function verifierLicence(licence: string): Contenu | null {
  const nettoye = licence.replace(/[\s-]/g, '')
  if (nettoye.length < 100) return null

  let octets: Buffer
  try {
    octets = debase32(nettoye)
  } catch {
    return null
  }

  if (octets.length < 4 + 64) return null

  const contenu: Contenu = {
    version: octets[0]!,
    expiration: (octets[1]! << 8) | octets[2]!,
    options: octets[3]!
  }
  const signature = octets.subarray(4, 4 + 64)

  try {
    if (!verify(null, messageSigne(contenu, empreintePoste()), CLE_PUBLIQUE, signature)) return null
  } catch {
    return null
  }

  return contenu
}

function dateExpiration(contenu: Contenu): string | null {
  if (contenu.expiration === 0) return null
  return new Date(ORIGINE + contenu.expiration * 86_400_000).toISOString().slice(0, 10)
}

/** Licence valide et non expirée enregistrée sur ce poste. */
function licenceActive(): Contenu | null {
  const etat = lireEtat()
  if (!etat.licence) return null

  const contenu = verifierLicence(etat.licence)
  if (!contenu) return null

  const fin = dateExpiration(contenu)
  if (fin && jourEffectif() > fin) return null

  return contenu
}

export function activee(): boolean {
  return licenceActive() !== null
}

/**
 * Enregistre une licence.
 *
 * Le contrôle a lieu avant l'enregistrement : une licence refusée n'est jamais
 * conservée, et le message dit pourquoi — un pharmacien qui recopie une clé
 * doit savoir s'il s'est trompé de caractère ou de poste.
 */
export function activer(licence: string, utilisateurId: number | null): EtatLicence {
  const contenu = verifierLicence(licence)

  if (!contenu) {
    tracer({
      utilisateurId,
      action: 'Activation refusée',
      entite: 'licence',
      resume: licence.replace(/[\s-]/g, '').slice(0, 12) + '…',
      resultat: 'refuse'
    })
    throw new ErreurMetier(
      'Cette clé d’activation n’est pas valable pour cet ordinateur. Vérifiez que vous avez ' +
        'bien communiqué le code d’installation affiché ci-dessus.',
      'licence'
    )
  }

  const fin = dateExpiration(contenu)
  if (fin && jourEffectif() > fin) {
    throw new ErreurMetier(`Cette licence a expiré le ${fin}.`, 'licence')
  }

  ecrireEtat({ ...lireEtat(), licence: licence.replace(/[\s-]/g, '') })

  tracer({
    utilisateurId,
    action: 'Logiciel activé',
    entite: 'licence',
    resume: fin ? `licence jusqu’au ${fin}` : 'licence perpétuelle'
  })

  return etat(0)
}

/** État complet, pour l'écran d'activation et le bandeau de démonstration. */
export function etat(ventesDuJour: number): EtatLicence {
  const contenu = licenceActive()
  const scelle = lireEtat()
  const fin = contenu ? dateExpiration(contenu) : null

  return {
    activee: contenu !== null,
    codeInstallation: codeInstallation(),
    expiration: fin,
    joursRestants: fin
      ? Math.max(0, Math.round((new Date(fin).getTime() - new Date(jourEffectif()).getTime()) / 86_400_000))
      : null,
    ventesDuJour,
    ventesMaximum: VENTES_PAR_JOUR_DEMO,
    jourEffectif: jourEffectif(),
    horlogeSuspecte: scelle.reculs > 0,
    reculs: scelle.reculs,
    bonds: scelle.bonds
  }
}

/**
 * Fonctions réservées à la version complète.
 *
 * On bloque ce qui sert à exploiter — analyser son activité, sortir ses
 * données — et rien de ce qui sert à essayer. Les sauvegardes ne figurent
 * volontairement pas ici : la sécurité des données d'un pharmacien n'est pas
 * un argument de vente.
 */
const RESERVE: Record<string, string> = {
  rapports: 'Les rapports',
  export: 'L’export des données',
  pilotage: 'Le suivi détaillé de l’activité'
}

export function exigerLicence(domaine: keyof typeof RESERVE | string): void {
  if (activee()) return

  throw new ErreurMetier(
    `${RESERVE[domaine] ?? 'Cette fonction'} n’est pas disponible en démonstration. ` +
      'Activez le logiciel pour y accéder.',
    'demonstration'
  )
}

/** Refuse la vente au-delà du quota quotidien de la démonstration. */
export function exigerVenteAutorisee(ventesDuJour: number): void {
  if (activee()) return

  if (ventesDuJour >= VENTES_PAR_JOUR_DEMO) {
    throw new ErreurMetier(
      `La démonstration permet ${VENTES_PAR_JOUR_DEMO} ventes par jour. ` +
        'Vous les avez toutes enregistrées aujourd’hui — reprenez demain, ou activez le logiciel.',
      'demonstration'
    )
  }
}
