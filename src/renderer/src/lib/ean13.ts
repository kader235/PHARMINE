/**
 * Dessiner un EAN-13, sans bibliothèque.
 *
 * POURQUOI À LA MAIN
 *
 * Une officine tchadienne travaille hors ligne, et le logiciel ne charge rien
 * depuis Internet. Une bibliothèque de plus, c'est un mégaoctet dans
 * l'installateur et une dépendance à surveiller — pour quatre-vingt-quinze
 * barres dont la norme tient sur une page.
 *
 * LA NORME, EN BREF
 *
 * Treize chiffres, quatre-vingt-quinze modules :
 *
 *   101  |  six chiffres × 7 modules  |  01010  |  six × 7  |  101
 *   garde         groupe gauche        milieu    droite     garde
 *
 * Le PREMIER chiffre n'est pas dessiné : il se lit dans l'alternance des
 * tables A et B utilisées pour les six chiffres du groupe gauche. C'est cette
 * astuce qui permet de coder treize chiffres dans douze positions.
 *
 * Le groupe droit utilise la table C, complément de A : une douchette qui lit
 * le code à l'envers reconnaît donc de quel côté elle a commencé.
 */

/** Table A — groupe gauche, parité impaire. */
const A = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011'
]

/** Table B — groupe gauche, parité paire. */
const B = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111'
]

/** Table C — groupe droit, complément de A. */
const C = [
  '1110010', '1100110', '1101100', '1000010', '1011100',
  '1001110', '1010000', '1000100', '1001000', '1110100'
]

/**
 * Alternance des tables A et B pour le groupe gauche, selon le premier chiffre.
 * C'est ici que se cache le treizième chiffre.
 */
const ALTERNANCE = [
  'AAAAAA', 'AABABB', 'AABBAB', 'AABBBA', 'ABAABB',
  'ABBAAB', 'ABBBAA', 'ABABAB', 'ABABBA', 'ABBABA'
]

/** Chiffre de contrôle : rang impair au poids 1, rang pair au poids 3. */
export function chiffreControle(douzeChiffres: string): number {
  let somme = 0
  for (let i = 0; i < 12; i++) {
    somme += Number(douzeChiffres[i]) * (i % 2 === 0 ? 1 : 3)
  }
  return (10 - (somme % 10)) % 10
}

export function estEan13Valide(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false
  return chiffreControle(code.slice(0, 12)) === Number(code[12])
}

/**
 * Les quatre-vingt-quinze modules du code, en « 0 » (clair) et « 1 » (barre).
 *
 * Renvoie une chaîne vide si le code n'est pas un EAN-13 cohérent : mieux vaut
 * une étiquette manifestement vide qu'un code-barres faux qu'une douchette
 * lirait comme un autre produit.
 */
export function modulesEan13(code: string): string {
  if (!estEan13Valide(code)) return ''

  const chiffres = code.split('').map(Number)
  const alternance = ALTERNANCE[chiffres[0]!]!

  let modules = '101'
  for (let i = 0; i < 6; i++) {
    const table = alternance[i] === 'A' ? A : B
    modules += table[chiffres[i + 1]!]!
  }
  modules += '01010'
  for (let i = 7; i < 13; i++) {
    modules += C[chiffres[i]!]!
  }
  return `${modules}101`
}

export interface Barre {
  x: number
  largeur: number
  /** Les barres de garde descendent sous les chiffres, comme sur une vraie boîte. */
  garde: boolean
}

/**
 * Les barres à dessiner, en modules — l'appelant choisit l'échelle.
 *
 * Les barres consécutives sont fusionnées : moins de rectangles, un rendu plus
 * net à l'impression, et un SVG qu'une imprimante d'entrée de gamme avale sans
 * broncher.
 */
export function barresEan13(code: string): Barre[] {
  const modules = modulesEan13(code)
  if (!modules) return []

  // Positions des barres de garde : début, milieu, fin.
  const estGarde = (x: number): boolean =>
    x < 3 || (x >= 45 && x < 50) || x >= 92

  const barres: Barre[] = []
  let x = 0
  while (x < modules.length) {
    if (modules[x] === '0') {
      x++
      continue
    }
    const depart = x
    const garde = estGarde(depart)
    // On ne fusionne que des barres de même nature : une garde et une barre de
    // donnée n'ont pas la même hauteur.
    while (x < modules.length && modules[x] === '1' && estGarde(x) === garde) x++
    barres.push({ x: depart, largeur: x - depart, garde })
  }
  return barres
}
