/**
 * Éprouve l'outil de licence hors ligne dans un vrai navigateur.
 *
 * POURQUOI CETTE ÉPREUVE EXISTE
 *
 * `Licences-PHARMINA.html` réécrit la signature Ed25519 et le format des clés.
 * Deux implémentations du même format finissent toujours par diverger — et une
 * clé fausse, c'est un pharmacien bloqué avec un client devant lui, à des
 * centaines de kilomètres.
 *
 * On charge donc la page dans une vraie fenêtre, on remplit les champs, on
 * clique, et on compare la clé obtenue à celle que produit `scripts/licence.js`
 * pour les mêmes entrées. Caractère par caractère.
 */
const { app, BrowserWindow } = require('electron')
const { createHash, createPrivateKey, sign } = require('node:crypto')
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')

const RACINE = join(__dirname, '..')
const PAGE = join(RACINE, '..', 'PHARMINA-versions', 'Licences-PHARMINA.html')
const CLE = join(RACINE, 'licence-privee.pem')
const ORIGINE = Date.UTC(2026, 0, 1)
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

let reussis = 0
let echoues = 0

function verifier(condition, description, observe) {
  if (condition) {
    reussis++
    console.log(`  OK    | ${description}`)
  } else {
    echoues++
    console.log(`  ECHEC | ${description}`)
    if (observe !== undefined) console.log(`        | ${JSON.stringify(observe)}`)
  }
}

// --- La référence : exactement ce que fait scripts/licence.js ---------------

function base32(octets) {
  let tampon = 0, bits = 0, sortie = ''
  for (const octet of octets) {
    tampon = (tampon << 8) | octet
    bits += 8
    while (bits >= 5) { sortie += ALPHABET[(tampon >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) sortie += ALPHABET[(tampon << (5 - bits)) & 31]
  return sortie
}

function debase32(texte) {
  let tampon = 0, bits = 0
  const octets = []
  for (const caractere of texte) {
    const normalise = caractere.toUpperCase().replace(/[IL]/, '1').replace(/O/, '0')
    const valeur = ALPHABET.indexOf(normalise)
    if (valeur < 0) throw new Error(`caractere inattendu : ${caractere}`)
    tampon = (tampon << 5) | valeur
    bits += 5
    if (bits >= 8) { octets.push((tampon >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Buffer.from(octets)
}

function licenceDeReference(code, jours) {
  const empreinte = debase32(code.replace(/[\s-]/g, '')).subarray(0, 10)
  const expiration = jours
    ? Math.round((Date.now() + Number(jours) * 86_400_000 - ORIGINE) / 86_400_000)
    : 0
  const entete = Buffer.from([1, expiration >> 8, expiration & 255, 0])
  const message = Buffer.concat([Buffer.from('PHARMINA-LICENCE-1'), entete, empreinte])
  const signature = sign(null, message, createPrivateKey(readFileSync(CLE)))
  const licence = base32(Buffer.concat([entete, signature]))
  return {
    cle: (licence.match(/.{1,5}/g) ?? []).join('-'),
    empreinte: createHash('sha256').update(licence).digest('hex').slice(0, 12),
    validite: expiration === 0
      ? 'perpétuelle'
      : new Date(ORIGINE + expiration * 86_400_000).toISOString().slice(0, 10)
  }
}

// --- L'épreuve --------------------------------------------------------------

async function principal() {
  await app.whenReady()

  console.log('\n-- Outil de licence hors ligne -----------------------------------\n')

  if (!existsSync(PAGE)) {
    console.log(`  Page introuvable : ${PAGE}`)
    app.exit(1)
    return
  }
  if (!existsSync(CLE)) {
    console.log('  Cle de l’editeur absente : comparaison impossible.')
    app.exit(1)
    return
  }

  const pem = readFileSync(CLE, 'utf8')
  const fenetre = new BrowserWindow({ width: 900, height: 1100, show: false })
  const erreursConsole = []
  // La nouvelle forme de l'evenement : un seul objet, avec un niveau nomme.
  fenetre.webContents.on('console-message', (evenement) => {
    const niveau = evenement?.level ?? ''
    if (niveau === 'error' || niveau === 'warning') {
      erreursConsole.push(`${niveau}: ${evenement?.message ?? ''}`)
    }
  })
  await fenetre.loadFile(PAGE)
  await new Promise((r) => setTimeout(r, 600))

  const poser = async (id, valeur) =>
    fenetre.webContents.executeJavaScript(`
      (() => {
        const champ = document.getElementById(${JSON.stringify(id)})
        const setter = Object.getOwnPropertyDescriptor(
          champ instanceof HTMLTextAreaElement
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype,
          'value'
        ).set
        setter.call(champ, ${JSON.stringify(valeur)})
        champ.dispatchEvent(new Event('input', { bubbles: true }))
        return champ.value
      })()`)

  await poser('pem', pem)

  const etatCle = await fenetre.webContents.executeJavaScript(
    `document.getElementById('etatCle').textContent`
  )
  verifier(etatCle.includes('reconnue'), 'la cle de l’editeur est reconnue par la page', etatCle)

  // Le champ de code doit se mettre en forme pendant la frappe : quatre
  // groupes de quatre, comme sur l'ecran du client.
  const misEnForme = await poser('code', '5vaw26g3nj9vg8d5')
  verifier(misEnForme === '5VAW-26G3-NJ9V-G8D5', 'le code est mis en forme pendant la frappe', misEnForme)

  const produire = async () => {
    await fenetre.webContents.executeJavaScript(`document.getElementById('produire').click()`)
    return fenetre.webContents.executeJavaScript(`
      (async () => {
        for (let essai = 0; essai < 100; essai++) {
          await new Promise((r) => setTimeout(r, 100))
          const visible = document.getElementById('resultat').classList.contains('visible')
          const erreur = document.getElementById('erreur').textContent
          if (visible || erreur) {
            return {
              cle: document.getElementById('rCle').textContent,
              empreinte: document.getElementById('rEmpreinte').textContent,
              validite: document.getElementById('rValidite').textContent,
              erreur
            }
          }
        }
        return { erreur: 'aucune reponse de la page' }
      })()`)
  }

  // --- Licence perpetuelle --------------------------------------------------
  const attenduePerpetuelle = licenceDeReference('5VAW-26G3-NJ9V-G8D5', null)
  const obtenue = await produire()

  verifier(!obtenue.erreur, 'la page produit une licence sans erreur', obtenue.erreur)
  verifier(
    obtenue.cle === attenduePerpetuelle.cle,
    'la cle est identique a celle de scripts/licence.js',
    { attendue: attenduePerpetuelle.cle.slice(0, 40), obtenue: (obtenue.cle ?? '').slice(0, 40) }
  )
  verifier(
    obtenue.empreinte === attenduePerpetuelle.empreinte,
    'l’empreinte de controle correspond',
    { attendue: attenduePerpetuelle.empreinte, obtenue: obtenue.empreinte }
  )
  verifier(obtenue.validite === 'perpétuelle', 'une licence sans duree est perpetuelle', obtenue.validite)

  // --- Licence a duree ------------------------------------------------------
  await poser('jours', '365')
  const attendue365 = licenceDeReference('5VAW-26G3-NJ9V-G8D5', '365')
  const obtenue365 = await produire()

  verifier(
    obtenue365.cle === attendue365.cle,
    'une licence de 365 jours est identique a la reference',
    { attendue: attendue365.cle.slice(0, 40), obtenue: (obtenue365.cle ?? '').slice(0, 40) }
  )
  verifier(
    obtenue365.validite === attendue365.validite,
    'la date de fin annoncee est la bonne',
    { attendue: attendue365.validite, obtenue: obtenue365.validite }
  )
  verifier(obtenue365.cle !== attenduePerpetuelle.cle, 'une duree differente donne une cle differente')

  // --- Un autre poste, une autre cle ---------------------------------------
  await poser('jours', '')
  await poser('code', '7K3M9PQR2XYZ4A5B')
  const autre = await produire()
  const attendueAutre = licenceDeReference('7K3M-9PQR-2XYZ-4A5B', null)
  verifier(autre.cle === attendueAutre.cle, 'un autre poste donne la cle attendue')
  verifier(autre.cle !== attenduePerpetuelle.cle, 'deux postes n’obtiennent pas la meme cle')

  // --- Les refus ------------------------------------------------------------
  const refuse = async (champs, quoi) => {
    for (const [id, valeur] of Object.entries(champs)) await poser(id, valeur)
    const resultat = await produire()
    verifier(!!resultat.erreur, `la page refuse ${quoi}`, resultat.erreur)
  }
  await refuse({ code: '' }, 'un code vide')
  await refuse({ code: '5VAW' }, 'un code trop court')
  await poser('code', '5vaw26g3nj9vg8d5')
  await refuse({ pem: 'ceci n’est pas une cle' }, 'une cle illisible')
  await refuse({ pem: '' }, 'une cle absente')

  // --- La page ne doit rien envoyer nulle part ------------------------------
  const sorties = await fenetre.webContents.executeJavaScript(`
    (() => {
      // On examine le CODE, pas les commentaires : ceux-ci parlent
      // legitimement de fetch et de WebSocket pour expliquer qu'on ne s'en
      // sert pas.
      const code = Array.from(document.querySelectorAll('script'))
        .map((s) => s.textContent)
        .join('\\n')
        .replace(/\\/\\*[\\s\\S]*?\\*\\//g, '')
        .replace(/\\/\\/.*$/gm, '')
      const suspects = /\\bfetch\\s*\\(|new\\s+XMLHttpRequest|new\\s+WebSocket|sendBeacon\\s*\\(/
      return {
        scriptsExternes: document.querySelectorAll('script[src]').length,
        stylesExternes: document.querySelectorAll('link[rel=stylesheet]').length,
        images: document.querySelectorAll('img').length,
        appelsReseau: suspects.test(code)
      }
    })()`)
  verifier(sorties.scriptsExternes === 0, 'aucun script charge depuis l’exterieur')
  verifier(sorties.stylesExternes === 0, 'aucune feuille de style exterieure')
  verifier(sorties.images === 0, 'aucune image a telecharger')
  verifier(!sorties.appelsReseau, 'aucun appel reseau dans la page')

  const politique = await fenetre.webContents.executeJavaScript(
    `document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? ''`
  )
  verifier(politique.includes("connect-src 'none'"), 'la politique interdit tout appel reseau')
  verifier(politique.includes("form-action 'none'"), 'la politique interdit tout envoi de formulaire')
  verifier(politique.includes("default-src 'none'"), 'la politique part de zero autorisation')

  // --- Lisible sur un telephone --------------------------------------------
  // C'est la que l'outil sert vraiment : en ville, sans ordinateur. Une page
  // qui deborde en largeur s'y utilise mal.
  for (const largeur of [360, 412, 768]) {
    fenetre.setContentSize(largeur, 900)
    await new Promise((r) => setTimeout(r, 250))
    const mesures = await fenetre.webContents.executeJavaScript(`
      (() => {
        const boutons = Array.from(document.querySelectorAll('button'))
          .filter((b) => b.offsetParent !== null)
        return {
          deborde: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          plusPetitBouton: Math.min(...boutons.map((b) => b.getBoundingClientRect().height))
        }
      })()`)
    verifier(!mesures.deborde, `la page ne deborde pas en largeur a ${largeur} px`)
    // Quarante-quatre pixels : la cible tactile minimale recommandee.
    verifier(
      mesures.plusPetitBouton >= 44,
      `les boutons restent atteignables au doigt a ${largeur} px`,
      mesures.plusPetitBouton
    )
  }

  verifier(erreursConsole.length === 0, 'aucune erreur dans la console', erreursConsole.slice(0, 3))

  fenetre.destroy()
  console.log(`\n=== ${reussis} verifications reussies, ${echoues} echouees ===\n`)
  app.exit(echoues ? 1 : 0)
}

principal().catch((erreur) => {
  console.error('ERREUR :', erreur)
  app.exit(1)
})
