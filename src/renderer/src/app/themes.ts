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

export type CleTheme = 'clair' | 'ocean' | 'cobalt' | 'ardoise' | 'brique'
export type CleDisposition = 'confort' | 'compacte' | 'tactile'

export interface DefinitionTheme {
  cle: CleTheme
  nom: string
  /** Fond de la barre latérale et couleur d'accent, pour la pastille d'aperçu. */
  pastille: [string, string]
}

export const THEMES: DefinitionTheme[] = [
  // Tous partagent la meme grammaire — barre laterale pleine, en-tetes de
  // tableau en aplat, angles droits. Seule la teinte change. La cle « clair »
  // est conservee pour ne pas invalider les preferences deja enregistrees sur
  // les postes ; elle designe desormais le vert.
  { cle: 'clair', nom: 'Vert', pastille: ['#0f7a62', '#0a5c49'] },
  { cle: 'ocean', nom: 'Bleu', pastille: ['#1a5fa8', '#134680'] },
  { cle: 'cobalt', nom: 'Cobalt', pastille: ['#3a44a8', '#2b3382'] },
  { cle: 'ardoise', nom: 'Ardoise', pastille: ['#465561', '#333f49'] },
  { cle: 'brique', nom: 'Brique', pastille: ['#a4462b', '#7f351f'] }
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

  if (cleTheme === 'clair') racine.removeAttribute('data-theme')
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

export function themeDuPoste(defaut = 'clair'): CleTheme {
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
