import { useEffect, useRef } from 'react'

/**
 * Lecture des codes-barres.
 *
 * Presque tous les lecteurs du marché — filaires, sans fil, douchettes,
 * lecteurs de comptoir — se présentent au système comme un clavier : ils
 * « tapent » le code puis envoient un terminateur. On ne peut donc pas les
 * distinguer par un port ou un pilote ; on les reconnaît à leur vitesse.
 *
 * Un humain tape au mieux une touche toutes les ~80 ms. Un lecteur en envoie
 * une toutes les 5 à 20 ms. Au-delà du seuil, la frappe est ignorée et le
 * tampon reparti de zéro : la saisie manuelle continue de fonctionner
 * normalement dans les mêmes champs.
 */

/**
 * Poste verrouillé : le lecteur écoute la fenêtre en phase de capture, avant
 * tout le reste. Sans ce drapeau, une douchette passée sur un article
 * remplirait un panier derrière l'écran de verrouillage.
 */
let verrouille = false

export function definirPosteVerrouille(valeur: boolean): void {
  verrouille = valeur
}

/** Délai maximal entre deux touches pour qu'il s'agisse d'un lecteur. */
const DELAI_MAX_MS = 45

/** En deçà, ce n'est pas un code-barres exploitable. */
const LONGUEUR_MIN = 4

/**
 * Chiffre correspondant à une touche, quelle que soit la disposition du
 * clavier. Beaucoup de lecteurs émettent les chiffres du pavé numérique, et
 * certains sont configurés en QWERTY alors que le poste est en AZERTY : sur
 * un clavier français, `event.key` renvoie alors « & » au lieu de « 1 ».
 * `event.code` désigne la touche physique et reste juste dans tous les cas.
 */
function chiffreDepuisTouche(e: KeyboardEvent): string | null {
  const correspondance = /^(?:Digit|Numpad)([0-9])$/.exec(e.code)
  if (correspondance) return correspondance[1]!
  // Lecteurs émettant directement un caractère utilisable (codes alphanumériques).
  if (e.key.length === 1 && /[0-9A-Za-z\-._]/.test(e.key)) return e.key
  return null
}

export interface OptionsLecteur {
  /** Appelée avec le code lu. */
  onScan: (code: string) => void
  /** Faux : le lecteur est ignoré (écran inactif, modale ouverte…). */
  actif?: boolean
}

export function useLecteurCodeBarres({ onScan, actif = true }: OptionsLecteur): void {
  const tampon = useRef('')
  const dernierAt = useRef(0)
  const rappel = useRef(onScan)
  rappel.current = onScan

  useEffect(() => {
    if (!actif) return

    const gerer = (e: KeyboardEvent): void => {
      if (verrouille) {
        tampon.current = ''
        return
      }

      // Un raccourci du logiciel n'est jamais un code-barres.
      if (e.ctrlKey || e.altKey || e.metaKey) {
        tampon.current = ''
        return
      }

      const maintenant = performance.now()
      const ecart = maintenant - dernierAt.current
      dernierAt.current = maintenant

      if (e.key === 'Enter' || e.key === 'Tab') {
        const code = tampon.current
        tampon.current = ''
        if (code.length >= LONGUEUR_MIN && ecart < DELAI_MAX_MS * 4) {
          // Le terminateur du lecteur ne doit pas valider un formulaire ni
          // faire sauter le focus au champ suivant.
          e.preventDefault()
          e.stopPropagation()
          rappel.current(code)
        }
        return
      }

      const caractere = chiffreDepuisTouche(e)
      if (caractere === null) {
        tampon.current = ''
        return
      }

      // Trop lent : c'est une frappe humaine, on repart d'un tampon neuf.
      tampon.current = ecart > DELAI_MAX_MS ? caractere : tampon.current + caractere
    }

    // Capture : on voit la touche avant les champs de saisie, ce qui permet
    // d'annuler le terminateur au bon moment.
    window.addEventListener('keydown', gerer, true)
    return () => window.removeEventListener('keydown', gerer, true)
  }, [actif])
}
