import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import Icone, { type NomIcone } from './Icone'
import type { Ton } from './Composants'

interface Notification {
  id: number
  ton: Ton
  titre: string
  message?: string
}

interface Contexte {
  succes: (titre: string, message?: string) => void
  erreur: (titre: string, message?: string) => void
  attention: (titre: string, message?: string) => void
  info: (titre: string, message?: string) => void
}

const ContexteNotifications = createContext<Contexte | null>(null)

const ICONES: Record<Ton, NomIcone> = {
  succes: 'coche',
  danger: 'triangle-alerte',
  attention: 'triangle-alerte',
  info: 'info',
  neutre: 'info'
}

/**
 * Confirmations discrètes. Elles n'interrompent jamais le travail : une vente
 * réussie ne doit pas exiger un clic supplémentaire pour continuer.
 */
export function FournisseurNotifications({ children }: { children: ReactNode }) {
  const [liste, setListe] = useState<Notification[]>([])
  const compteur = useRef(0)

  const retirer = useCallback((id: number) => {
    setListe((precedentes) => precedentes.filter((n) => n.id !== id))
  }, [])

  const ajouter = useCallback(
    (ton: Ton, titre: string, message?: string) => {
      const id = ++compteur.current
      setListe((precedentes) => [...precedentes.slice(-3), { id, ton, titre, message }])
      // Une erreur reste plus longtemps : elle demande souvent une action.
      setTimeout(() => retirer(id), ton === 'danger' ? 8000 : 4000)
    },
    [retirer]
  )

  const valeur = useMemo<Contexte>(
    () => ({
      succes: (titre, message) => ajouter('succes', titre, message),
      erreur: (titre, message) => ajouter('danger', titre, message),
      attention: (titre, message) => ajouter('attention', titre, message),
      info: (titre, message) => ajouter('info', titre, message)
    }),
    [ajouter]
  )

  return (
    <ContexteNotifications.Provider value={valeur}>
      {children}
      <div className="notifications" role="status" aria-live="polite">
        {liste.map((n) => (
          <div key={n.id} className={`notification ${n.ton}`}>
            <Icone
              nom={ICONES[n.ton]}
              taille={15}
              className=""
              // La couleur suit le ton de la notification.
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{n.titre}</strong>
              {n.message ? <p>{n.message}</p> : null}
            </div>
            <button className="fermer" onClick={() => retirer(n.id)} aria-label="Fermer">
              <Icone nom="croix" taille={13} />
            </button>
          </div>
        ))}
      </div>
    </ContexteNotifications.Provider>
  )
}

export function useNotifications(): Contexte {
  const contexte = useContext(ContexteNotifications)
  if (!contexte) throw new Error('useNotifications doit être utilisé dans FournisseurNotifications.')
  return contexte
}
