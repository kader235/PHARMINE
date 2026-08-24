import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

/**
 * Formats de sortie.
 *
 * `ticket`  — rouleau continu 80 mm des imprimantes thermiques de comptoir.
 * `ticket57`— rouleau 57 mm, courant sur les petites thermiques portables.
 * `a5`      — demi-page : facture compacte, deux par feuille A4 si besoin.
 * `a4`      — facture et documents administratifs.
 */
export type FormatImpression = 'ticket' | 'ticket57' | 'a5' | 'a4'

export const FORMATS: { valeur: FormatImpression; libelle: string; description: string }[] = [
  { valeur: 'ticket', libelle: 'Ticket 80 mm', description: 'Imprimante thermique, papier continu' },
  { valeur: 'ticket57', libelle: 'Ticket 57 mm', description: 'Petite thermique ou imprimante mobile' },
  { valeur: 'a5', libelle: 'Facture A5', description: 'Demi-page, économique' },
  { valeur: 'a4', libelle: 'Facture A4', description: 'Format administratif complet' }
]

interface Contexte {
  /** Rend `contenu` dans la zone d'impression puis ouvre la boîte de dialogue. */
  imprimer: (contenu: ReactNode, format?: FormatImpression) => void
}

const ContexteImpression = createContext<Contexte | null>(null)

/**
 * Le papier continu se déclare en hauteur automatique : l'imprimante coupe à
 * la longueur utile, et un ticket de trois lignes ne consomme pas 30 cm.
 */
const REGLES: Record<FormatImpression, string> = {
  ticket: '@page { size: 80mm auto; margin: 3mm; }',
  ticket57: '@page { size: 57mm auto; margin: 2mm; }',
  a5: '@page { size: A5; margin: 10mm; }',
  a4: '@page { size: A4; margin: 14mm 12mm; }'
}

export function FournisseurImpression({ children }: { children: ReactNode }) {
  const [contenu, setContenu] = useState<ReactNode>(null)
  const [format, setFormat] = useState<FormatImpression>('ticket')

  const imprimer = useCallback((aImprimer: ReactNode, formatVoulu: FormatImpression = 'ticket') => {
    setFormat(formatVoulu)
    setContenu(aImprimer)

    // Le format de page se règle par une feuille injectée : une règle @page ne
    // peut pas dépendre d'une classe.
    let feuille = document.getElementById('format-impression')
    if (!feuille) {
      feuille = document.createElement('style')
      feuille.id = 'format-impression'
      document.head.appendChild(feuille)
    }
    feuille.textContent = REGLES[formatVoulu]

    // Deux images successives : la première monte le contenu, la seconde
    // garantit qu'il est peint avant l'ouverture du dialogue. Le document
    // reste ensuite monté — il est masqué à l'écran — ce qui permet de
    // relancer l'impression sans tout reconstruire.
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
  }, [])

  return (
    <ContexteImpression.Provider value={{ imprimer }}>
      {children}
      <div id="impression" className={`impression impression-${format}`} aria-hidden="true">
        {contenu}
      </div>
    </ContexteImpression.Provider>
  )
}

export function useImpression(): Contexte {
  const contexte = useContext(ContexteImpression)
  if (!contexte) throw new Error('useImpression doit être utilisé dans FournisseurImpression.')
  return contexte
}

/** Vrai pour les formats à rouleau, qui imposent une mise en page en colonne étroite. */
export function estRouleau(format: FormatImpression): boolean {
  return format === 'ticket' || format === 'ticket57'
}
