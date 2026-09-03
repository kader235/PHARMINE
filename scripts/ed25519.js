/**
 * Signature Ed25519 en JavaScript pur.
 *
 * POURQUOI RÉÉCRIRE CE QUE NODE SAIT DÉJÀ FAIRE
 *
 * L'outil de licence hors ligne tourne dans un navigateur, sur un téléphone,
 * sans réseau. Trois portes se fermaient :
 *
 *   — `node:crypto` n'existe pas dans un navigateur ;
 *   — WebCrypto ne signe en Ed25519 que sur les navigateurs très récents, et
 *     un téléphone d'occasion au Tchad n'en fait pas partie ;
 *   — charger une bibliothèque depuis un CDN suppose une connexion, ce qui est
 *     exactement ce qu'on veut éviter.
 *
 * Restait à l'écrire. La courbe tient en quatre-vingts lignes ; seul SHA-512
 * est emprunté — à WebCrypto dans le navigateur, à Node ici — parce qu'il est
 * disponible partout et depuis toujours.
 *
 * CE FICHIER EST ÉPROUVÉ CONTRE `node:crypto`
 *
 * Une implémentation de courbe elliptique écrite à la main et non vérifiée
 * n'aurait aucune valeur : une signature fausse produit une licence que le
 * logiciel refuse, et le pharmacien reste bloqué. `scripts/ed25519.test.js`
 * compare octet par octet avec la signature de Node, sur la vraie clé et sur
 * des clés tirées au sort.
 */

const P = 2n ** 255n - 19n
const L = 2n ** 252n + 27742317777372353535851937790883648493n

function mod(a) {
  const r = a % P
  return r >= 0n ? r : r + P
}

/** Inverse modulaire par exponentiation : p est premier, donc a^(p-2). */
function inverse(a) {
  return puissance(a, P - 2n)
}

function puissance(base, exposant) {
  let resultat = 1n
  let b = mod(base)
  let e = exposant
  while (e > 0n) {
    if (e & 1n) resultat = mod(resultat * b)
    b = mod(b * b)
    e >>= 1n
  }
  return resultat
}

const D = mod(-121665n * inverse(121666n))

/**
 * Points en coordonnées étendues (X, Y, Z, T).
 *
 * Les coordonnées projectives évitent une inversion modulaire à chaque
 * addition — l'opération la plus coûteuse de loin. On n'inverse qu'une fois,
 * à l'encodage final.
 */
const NEUTRE = [0n, 1n, 1n, 0n]

const BASE = (() => {
  const y = mod(4n * inverse(5n))
  // x se retrouve depuis y par l'équation de la courbe : x² = (y²-1)/(dy²+1)
  const xx = mod((y * y - 1n) * inverse(D * y * y + 1n))
  let x = puissance(xx, (P + 3n) / 8n)
  if (mod(x * x) !== xx) x = mod(x * puissance(2n, (P - 1n) / 4n))
  if (x % 2n !== 0n) x = P - x
  return [x, y, 1n, mod(x * y)]
})()

function additionner(a, b) {
  const [X1, Y1, Z1, T1] = a
  const [X2, Y2, Z2, T2] = b
  const A = mod((Y1 - X1) * (Y2 - X2))
  const B = mod((Y1 + X1) * (Y2 + X2))
  const C = mod(T1 * 2n * D * T2)
  const Dd = mod(Z1 * 2n * Z2)
  const E = B - A
  const F = Dd - C
  const G = Dd + C
  const H = B + A
  return [mod(E * F), mod(G * H), mod(F * G), mod(E * H)]
}

/**
 * Multiplication scalaire, par doublement et addition.
 *
 * Ce n'est pas une implémentation à temps constant : elle ne convient pas pour
 * signer avec la clé d'un tiers sur une machine partagée. Ici la clé est celle
 * de l'éditeur, sur sa propre machine, hors ligne — le modèle de menace est la
 * perte du fichier, pas l'analyse temporelle.
 */
function multiplier(scalaire, point) {
  let resultat = NEUTRE
  let addition = point
  let s = scalaire
  while (s > 0n) {
    if (s & 1n) resultat = additionner(resultat, addition)
    addition = additionner(addition, addition)
    s >>= 1n
  }
  return resultat
}

function encoderPoint(point) {
  const [X, Y, Z] = point
  const zi = inverse(Z)
  const x = mod(X * zi)
  const y = mod(Y * zi)
  const octets = new Uint8Array(32)
  let reste = y
  for (let i = 0; i < 32; i++) {
    octets[i] = Number(reste & 255n)
    reste >>= 8n
  }
  // Le bit de poids fort porte le signe de x : c'est ce qui permet de
  // retrouver x depuis y à la vérification.
  if (x & 1n) octets[31] |= 0x80
  return octets
}

function petitBoutienVersEntier(octets) {
  let valeur = 0n
  for (let i = octets.length - 1; i >= 0; i--) valeur = (valeur << 8n) | BigInt(octets[i])
  return valeur
}

function entierVersPetitBoutien(valeur, longueur) {
  const octets = new Uint8Array(longueur)
  let reste = valeur
  for (let i = 0; i < longueur; i++) {
    octets[i] = Number(reste & 255n)
    reste >>= 8n
  }
  return octets
}

function concatener(...morceaux) {
  const total = morceaux.reduce((s, m) => s + m.length, 0)
  const sortie = new Uint8Array(total)
  let position = 0
  for (const morceau of morceaux) {
    sortie.set(morceau, position)
    position += morceau.length
  }
  return sortie
}

/**
 * Signe un message avec une graine Ed25519 de trente-deux octets.
 *
 * `sha512` est fourni par l'appelant — WebCrypto dans un navigateur, Node
 * ici — et doit renvoyer une promesse d'Uint8Array.
 */
async function signer(graine, message, sha512) {
  if (graine.length !== 32) throw new Error('La graine Ed25519 fait trente-deux octets.')

  const h = await sha512(graine)

  // Le scalaire est « bridé » : trois bits de poids faible à zéro pour rester
  // dans le sous-groupe, et le bit 254 forcé. C'est la norme, pas une ruse.
  const brides = h.slice(0, 32)
  brides[0] &= 248
  brides[31] &= 127
  brides[31] |= 64
  const a = petitBoutienVersEntier(brides)

  const prefixe = h.slice(32, 64)
  const A = encoderPoint(multiplier(a, BASE))

  // r est déterministe : dérivé du message et de la clé, jamais tiré au sort.
  // Deux signatures du même message sont donc identiques — ce qui rend cette
  // implémentation comparable à celle de Node, octet par octet.
  const r = petitBoutienVersEntier(await sha512(concatener(prefixe, message))) % L
  const R = encoderPoint(multiplier(r, BASE))

  const k = petitBoutienVersEntier(await sha512(concatener(R, A, message))) % L
  const S = (r + k * a) % L

  return concatener(R, entierVersPetitBoutien(S, 32))
}

/**
 * Extrait la graine d'une clé privée au format PEM.
 *
 * Un PKCS#8 Ed25519 est court et de forme fixe : la graine occupe les
 * trente-deux derniers octets. On le vérifie plutôt que de le supposer.
 */
function graineDepuisPem(pem) {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')
  if (!base64) throw new Error('Ce texte ne contient aucune clé.')

  let der
  try {
    der =
      typeof atob === 'function'
        ? Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
        : new Uint8Array(Buffer.from(base64, 'base64'))
  } catch {
    throw new Error('Ce texte n’est pas une clé lisible.')
  }

  // 302e020100300506032b657004220420 — en-tête d'une clé privée Ed25519.
  const attendu = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70]
  if (der.length !== 48 || !attendu.every((o, i) => der[i] === o)) {
    throw new Error(
      'Cette clé n’est pas une clé privée Ed25519. Utilisez licence-privee.pem tel quel.'
    )
  }
  return der.slice(16, 48)
}

module.exports = { signer, graineDepuisPem, encoderPoint, multiplier, BASE }
