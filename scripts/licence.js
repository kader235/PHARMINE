/**
 * Production des licences PHARMINA.
 *
 * OUTIL DE L'ÉDITEUR — il ne part jamais chez le client.
 *
 * Le pharmacien lit son CODE D'INSTALLATION sur l'écran d'activation et vous
 * le communique (téléphone, message, courriel). Vous produisez ici la clé
 * correspondante, il la colle, le logiciel est activé.
 *
 *   npm run licence -- --code 7K3M-9PQR-2XYZ-4A5B
 *   npm run licence -- --code 7K3M-9PQR-2XYZ-4A5B --jours 365
 *   npm run licence -- --code 7K3M-9PQR-2XYZ-4A5B --officine "Pharmacie du Plateau"
 *
 * Sans --jours, la licence est perpétuelle.
 *
 * LA CLÉ PRIVÉE.
 *
 * `licence-privee.pem` signe les licences. Elle n'est pas versionnée et ne doit
 * jamais être livrée : le logiciel ne contient que la clé publique, ce qui rend
 * une licence infalsifiable même pour qui désassemble le programme.
 *
 * Sauvegardez ce fichier hors de cet ordinateur. Le perdre n'invalide aucune
 * licence déjà émise, mais interdit d'en produire de nouvelles pour les
 * installations existantes : il faudrait changer la clé publique, donc livrer
 * une nouvelle version, donc réactiver tous les postes.
 */
const { createPrivateKey, createHash, sign } = require('node:crypto')
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')

const RACINE = join(__dirname, '..')
const CLE_PRIVEE = join(RACINE, 'licence-privee.pem')
const ORIGINE = Date.UTC(2026, 0, 1)
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function base32(octets) {
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

function debase32(texte) {
  let tampon = 0
  let bits = 0
  const octets = []
  for (const caractere of texte) {
    const normalise = caractere.toUpperCase().replace(/[IL]/, '1').replace(/O/, '0')
    const valeur = ALPHABET.indexOf(normalise)
    if (valeur < 0) {
      console.error(`\nCaractère inattendu dans le code d'installation : « ${caractere} ».\n`)
      process.exit(1)
    }
    tampon = (tampon << 5) | valeur
    bits += 5
    if (bits >= 8) {
      octets.push((tampon >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(octets)
}

function argument(nom) {
  const index = process.argv.indexOf(`--${nom}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function main() {
  const code = argument('code')
  const jours = argument('jours')
  const officine = argument('officine') ?? ''

  if (!code) {
    console.error(
      '\nIndiquez le code d’installation affiché sur le poste du client :\n\n' +
        '  npm run licence -- --code XXXX-XXXX-XXXX-XXXX\n' +
        '  npm run licence -- --code XXXX-XXXX-XXXX-XXXX --jours 365\n'
    )
    process.exit(1)
  }

  if (!existsSync(CLE_PRIVEE)) {
    console.error(
      `\nClé privée introuvable : ${CLE_PRIVEE}\n\n` +
        'Sans elle, aucune licence ne peut être produite. Restaurez la sauvegarde\n' +
        'de ce fichier — il n’est pas versionné, précisément pour qu’il ne parte\n' +
        'jamais avec le logiciel.\n'
    )
    process.exit(1)
  }

  // Le code d'installation EST l'empreinte du poste : dix octets, quatre-vingts
  // bits. C'est exactement ce que la signature couvre, et ce que le logiciel
  // recalcule de son cote pour verifier.
  const empreinte = debase32(code.replace(/[\s-]/g, '')).subarray(0, 10)
  if (empreinte.length !== 10) {
    console.error('')
    console.error(`Ce code d’installation fait ${empreinte.length} octets au lieu de 10.`)
    console.error('Demandez au client les quatre groupes de quatre caracteres')
    console.error('affiches sur son ecran d’activation.')
    console.error('')
    process.exit(1)
  }

  const expiration = jours
    ? Math.round((Date.now() + Number(jours) * 86_400_000 - ORIGINE) / 86_400_000)
    : 0

  if (expiration < 0 || expiration > 65535) {
    console.error('\nDurée hors limites : indiquez entre 1 et 100 000 jours.\n')
    process.exit(1)
  }

  const entete = Buffer.from([1, expiration >> 8, expiration & 255, 0])
  const message = Buffer.concat([Buffer.from('PHARMINA-LICENCE-1'), entete, empreinte])
  const signature = sign(null, message, createPrivateKey(readFileSync(CLE_PRIVEE)))

  const licence = base32(Buffer.concat([entete, signature]))
  const groupes = (licence.match(/.{1,5}/g) ?? []).join('-')

  const fin = expiration === 0 ? 'perpétuelle' : new Date(ORIGINE + expiration * 86_400_000).toISOString().slice(0, 10)

  console.log('')
  console.log('  LICENCE PHARMINA')
  if (officine) console.log(`  Officine   : ${officine}`)
  console.log(`  Poste      : ${code.toUpperCase()}`)
  console.log(`  Validité   : ${fin}`)
  console.log(`  Empreinte  : ${createHash('sha256').update(licence).digest('hex').slice(0, 12)}`)
  console.log('')
  console.log('  Clé à communiquer au client :')
  console.log('')
  for (const ligne of groupes.match(/.{1,60}/g) ?? []) console.log(`    ${ligne}`)
  console.log('')
}

main()
