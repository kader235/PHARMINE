import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { appeler } from '../lib/api'
import { useNotifications } from './Notifications'

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
  /**
   * Rend `contenu` dans la zone d'impression puis l'envoie à l'imprimante.
   *
   * Le document part directement sur l'imprimante réglée pour son format.
   * Si l'impression directe est désactivée, impossible ou refusée, la boîte
   * de dialogue du système prend le relais : on n'avale jamais un document.
   */
  imprimer: (contenu: ReactNode, format?: FormatImpression) => void
}

interface ResultatImpression {
  imprime: boolean
  imprimante: string | null
  repliDialogue: boolean
  motif?: string
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
  const notifications = useNotifications()
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
    // garantit qu'il est peint avant l'envoi. Le document reste ensuite monté
    // — il est masqué à l'écran — ce qui permet de relancer l'impression sans
    // tout reconstruire.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        // Hauteur réellement occupée : une imprimante à rouleau n'a pas de
        // format de page, et sans cette mesure elle déroulerait une feuille
        // entière pour un ticket de trois lignes.
        const zone = document.getElementById('impression')
        const hauteurPx = zone ? Math.ceil(zone.getBoundingClientRect().height) : undefined

        appeler<ResultatImpression>('impression.imprimer', { format: formatVoulu, hauteurPx })
          .then((resultat) => {
            if (resultat.imprime) {
              if (resultat.imprimante) {
                notifications.succes('Document envoyé', resultat.imprimante)
              }
              return
            }
            if (resultat.motif) {
              notifications.attention('Impression directe impossible', resultat.motif)
            }
            if (resultat.repliDialogue) window.print()
          })
          .catch(() => {
            // Le processus principal n'a pas répondu : la boîte de dialogue
            // reste le dernier recours, et elle fonctionne toujours.
            window.print()
          })
      })
    )
  }, [notifications])

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
