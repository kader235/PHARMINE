import { useCallback, useEffect, useRef, useState } from 'react'
import { appeler, messageErreur, type ErreurAffichable } from './api'

interface EtatRequete<T> {
  donnees: T | null
  chargement: boolean
  erreur: ErreurAffichable | null
}

/**
 * Charge des données depuis le processus principal.
 *
 * Les trois états — chargement, erreur, données — sont explicites : chaque
 * écran peut donc afficher un état honnête plutôt qu'un tableau vide ambigu.
 */
export function useRequete<T>(
  canal: string,
  charge?: unknown,
  actif = true
): EtatRequete<T> & { recharger: () => void } {
  const [etat, setEtat] = useState<EtatRequete<T>>({
    donnees: null,
    chargement: actif,
    erreur: null
  })
  const cle = JSON.stringify(charge ?? null)
  const dernierAppel = useRef(0)

  const executer = useCallback(() => {
    if (!actif) {
      setEtat({ donnees: null, chargement: false, erreur: null })
      return
    }
    const appelCourant = ++dernierAppel.current
    setEtat((precedent) => ({ ...precedent, chargement: true, erreur: null }))

    appeler<T>(canal, charge ?? undefined)
      .then((donnees) => {
        // Une réponse plus ancienne ne doit jamais écraser une plus récente.
        if (appelCourant === dernierAppel.current) {
          setEtat({ donnees, chargement: false, erreur: null })
        }
      })
      .catch((erreur) => {
        if (appelCourant === dernierAppel.current) {
          setEtat({ donnees: null, chargement: false, erreur: messageErreur(erreur) })
        }
      })
    // `cle` remplace `charge` : comparaison par valeur et non par référence.

  }, [canal, cle, actif])

  useEffect(executer, [executer])

  return { ...etat, recharger: executer }
}

/** Retarde une valeur qui change vite (saisie de recherche). */
export function useDifferee<T>(valeur: T, delai = 180): T {
  const [differee, setDifferee] = useState(valeur)
  useEffect(() => {
    const minuteur = setTimeout(() => setDifferee(valeur), delai)
    return () => clearTimeout(minuteur)
  }, [valeur, delai])
  return differee
}

/** Exécute une action distante en suivant son état d'envoi. */
export function useAction(): {
  enCours: boolean
  erreur: ErreurAffichable | null
  executer: <T>(canal: string, charge?: unknown) => Promise<T | null>
  reinitialiser: () => void
} {
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<ErreurAffichable | null>(null)

  const executer = useCallback(async <T,>(canal: string, charge?: unknown): Promise<T | null> => {
    setEnCours(true)
    setErreur(null)
    try {
      return await appeler<T>(canal, charge)
    } catch (e) {
      setErreur(messageErreur(e))
      return null
    } finally {
      setEnCours(false)
    }
  }, [])

  const reinitialiser = useCallback(() => setErreur(null), [])

  return { enCours, erreur, executer, reinitialiser }
}

/** Raccourci clavier global. */
export function useRaccourci(touche: string, action: () => void, avecCtrl = false): void {
  const derniereAction = useRef(action)
  derniereAction.current = action

  useEffect(() => {
    const gerer = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== touche.toLowerCase()) return
      if (avecCtrl && !(e.ctrlKey || e.metaKey)) return
      if (!avecCtrl && (e.ctrlKey || e.metaKey || e.altKey)) return

      // Ne pas détourner une touche pendant une saisie, sauf raccourci Ctrl.
      const cible = e.target as HTMLElement | null
      const enSaisie =
        cible?.tagName === 'INPUT' || cible?.tagName === 'TEXTAREA' || cible?.isContentEditable
      if (enSaisie && !avecCtrl) return

      e.preventDefault()
      derniereAction.current()
    }
    window.addEventListener('keydown', gerer)
    return () => window.removeEventListener('keydown', gerer)
  }, [touche, avecCtrl])
}
