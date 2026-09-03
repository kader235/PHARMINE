/**
 * Éprouve la signature Ed25519 écrite à la main contre celle de Node.
 *
 * Une implémentation de courbe elliptique non vérifiée n'aurait aucune valeur :
 * une signature fausse produit une licence que le logiciel refuse, et le
 * pharmacien reste bloqué avec un client devant lui. On compare donc octet par
 * octet, sur la vraie clé de l'éditeur et sur des clés tirées au sort.
 */
const {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify
} = require('node:crypto')
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const { signer, graineDepuisPem } = require('./ed25519')

const sha512 = async (octets) =>
  new Uint8Array(createHash('sha512').update(Buffer.from(octets)).digest())

let reussis = 0
let echoues = 0

function verifier(condition, description, observe) {
  if (condition) {
    reussis++
    console.log(`  OK    | ${description}`)
  } else {
    echoues++
    console.log(`  ECHEC | ${description}`)
    if (observe !== undefined) console.log(`        | observe : ${JSON.stringify(observe)}`)
  }
}

async function principal() {
  console.log('\n-- Signature Ed25519 ecrite a la main ----------------------------\n')

  // --- Contre des cles tirees au sort, sur des messages varies -------------
  for (let essai = 0; essai < 12; essai++) {
    const { privateKey } = generateKeyPairSync('ed25519')
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' })
    const graine = graineDepuisPem(pem)

    const message = randomBytes(essai === 0 ? 0 : essai * 17)
    const attendue = sign(null, message, privateKey)
    const obtenue = Buffer.from(await signer(graine, new Uint8Array(message), sha512))

    if (!attendue.equals(obtenue)) {
      verifier(false, `signature identique a celle de Node (essai ${essai})`, {
        attendue: attendue.toString('hex').slice(0, 32),
        obtenue: obtenue.toString('hex').slice(0, 32)
      })
      continue
    }

    // Et elle doit se verifier avec la cle publique, ce qui est le seul
    // critere qui compte pour le logiciel installe.
    const acceptee = verify(null, message, createPublicKey(privateKey), obtenue)
    verifier(acceptee, `signature acceptee par la verification de Node (essai ${essai})`)
  }

  // --- Contre la vraie cle de l'editeur ------------------------------------
  const cleEditeur = join(__dirname, '..', 'licence-privee.pem')
  if (existsSync(cleEditeur)) {
    const pem = readFileSync(cleEditeur, 'utf8')
    const graine = graineDepuisPem(pem)
    const privee = createPrivateKey(pem)

    // Le message exact d'une licence perpetuelle, tel que scripts/licence.js
    // le compose : en-tete de quatre octets, puis l'empreinte du poste.
    const entete = Buffer.from([1, 0, 0, 0])
    const empreinte = randomBytes(10)
    const message = Buffer.concat([Buffer.from('PHARMINA-LICENCE-1'), entete, empreinte])

    const attendue = sign(null, message, privee)
    const obtenue = Buffer.from(await signer(graine, new Uint8Array(message), sha512))
    verifier(attendue.equals(obtenue), 'signature identique sur la vraie cle de l’editeur')
    verifier(
      verify(null, message, createPublicKey(privee), obtenue),
      'la licence signee a la main est acceptee par la cle publique'
    )
  } else {
    console.log('  (cle de l’editeur absente : comparaison sautee)')
  }

  // --- Les refus attendus ---------------------------------------------------
  const refuse = (texte, quoi) => {
    let message = ''
    try {
      graineDepuisPem(texte)
    } catch (erreur) {
      message = erreur.message
    }
    verifier(message !== '', `une cle ${quoi} est refusee`, message)
  }
  refuse('', 'vide')
  refuse('n’importe quoi', 'illisible')
  refuse(
    generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }),
    'publique au lieu de privee'
  )
  refuse(
    generateKeyPairSync('rsa', { modulusLength: 2048 })
      .privateKey.export({ type: 'pkcs8', format: 'pem' }),
    'RSA au lieu d’Ed25519'
  )

  console.log(`\n=== ${reussis} verifications reussies, ${echoues} echouees ===\n`)
  process.exit(echoues ? 1 : 0)
}

principal().catch((erreur) => {
  console.error('ERREUR :', erreur)
  process.exit(1)
})
