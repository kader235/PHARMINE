/**
 * Apparence de l'interface.
 *
 * Deux réglages indépendants :
 *
 *   — le **thème** recolore la barre latérale et l'accent ;
 *   — la **disposition** change la densité et, pour le mode tactile, la place
 *     de la navigation.
 *
 * Les deux sont propres au poste : le comptoir tactile et le bureau du
 * responsable n'ont pas les mêmes besoins, même dans une seule officine.
 */

export type CleTheme = 'sauge' | 'ocean' | 'cobalt' | 'ardoise' | 'brique'
export type CleDisposition = 'confort' | 'compacte' | 'tactile'

export interface DefinitionTheme {
  cle: CleTheme
  nom: string
  /** Fond de la barre latérale et couleur d'accent, pour la pastille d'aperçu. */
  pastille: [string, string]
}

export const THEMES: DefinitionTheme[] = [
  { cle: 'sauge', nom: 'Sauge', pastille: ['#16302a', '#15654e'] },
  { cle: 'ocean', nom: 'Océan', pastille: ['#16283d', '#1d5c96'] },
  { cle: 'cobalt', nom: 'Cobalt', pastille: ['#1a1e3c', '#3a44a8'] },
  { cle: 'ardoise', nom: 'Ardoise', pastille: ['#242b31', '#46545f'] },
  { cle: 'brique', nom: 'Brique', pastille: ['#2e211d', '#a4462b'] }
]

export interface DefinitionDisposition {
  cle: CleDisposition
  nom: string
  description: string
}

export const DISPOSITIONS: DefinitionDisposition[] = [
  { cle: 'confort', nom: 'Confort', description: 'Navigation à gauche, densité courante.' },
  { cle: 'compacte', nom: 'Compacte', description: 'Petits caractères, le maximum de lignes.' },
  { cle: 'tactile', nom: 'Tactile', description: 'Modules en onglets, cibles larges.' }
]

const CLE_THEME = 'pharmina.theme'
const CLE_DISPOSITION = 'pharmina.disposition'

export function theme(cle: string | undefined): DefinitionTheme {
  return THEMES.find((t) => t.cle === cle) ?? THEMES[0]!
}

/**
 * Applique l'apparence au document.
 *
 * Les valeurs par défaut n'écrivent aucun attribut : elles vivent déjà dans
 * `:root`, et un attribut superflu compliquerait la lecture de la feuille.
 */
export function appliquerApparence(cleTheme: CleTheme, cleDisposition: CleDisposition): void {
  const racine = document.documentElement

  if (cleTheme === 'sauge') racine.removeAttribute('data-theme')
  else racine.setAttribute('data-theme', cleTheme)

  if (cleDisposition === 'confort') racine.removeAttribute('data-disposition')
  else racine.setAttribute('data-disposition', cleDisposition)
}

function lire<T extends string>(cle: string, valides: readonly T[], defaut: T): T {
  try {
    const enregistre = localStorage.getItem(cle)
    if (enregistre && (valides as readonly string[]).includes(enregistre)) return enregistre as T
  } catch {
    // Stockage local indisponible : on retombe sur le réglage de l'officine.
  }
  return defaut
}

export function themeDuPoste(defaut = 'sauge'): CleTheme {
  return lire(
    CLE_THEME,
    THEMES.map((t) => t.cle),
    theme(defaut).cle
  )
}

export function dispositionDuPoste(defaut: CleDisposition = 'confort'): CleDisposition {
  return lire(
    CLE_DISPOSITION,
    DISPOSITIONS.map((d) => d.cle),
    defaut
  )
}

export function retenirApparence(cleTheme: CleTheme, cleDisposition: CleDisposition): void {
  try {
    localStorage.setItem(CLE_THEME, cleTheme)
    localStorage.setItem(CLE_DISPOSITION, cleDisposition)
  } catch {
    // Sans stockage local, le choix vaut au moins pour cette session.
  }
}
