import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Pharmacie, SessionActive, Utilisateur } from '@shared/types'
import { appeler } from '../lib/api'
import { configurerDevise } from '../lib/format'

interface ValeurSession {
  utilisateur: Utilisateur
  pharmacie: Pharmacie
  permissions: Set<string>
  /** Vrai si l'utilisateur détient la permission. */
  peut: (code: string) => boolean
  deconnecter: () => Promise<void>
}

const ContexteSession = createContext<ValeurSession | null>(null)

export function FournisseurSession({
  session,
  onDeconnexion,
  children
}: {
  session: SessionActive
  onDeconnexion: () => void
  children: ReactNode
}) {
  const [courante] = useState(session)

  configurerDevise(courante.pharmacie.devise_symbole, courante.pharmacie.devise_decimales)

  const deconnecter = useCallback(async () => {
    try {
      await appeler('auth.deconnecter')
    } finally {
      onDeconnexion()
    }
  }, [onDeconnexion])

  const valeur = useMemo<ValeurSession>(() => {
    const permissions = new Set(courante.permissions)
    return {
      utilisateur: courante.utilisateur,
      pharmacie: courante.pharmacie,
      permissions,
      peut: (code: string) => permissions.has(code),
      deconnecter
    }
  }, [courante, deconnecter])

  return <ContexteSession.Provider value={valeur}>{children}</ContexteSession.Provider>
}

export function useSession(): ValeurSession {
  const contexte = useContext(ContexteSession)
  if (!contexte) throw new Error('useSession doit être utilisé dans FournisseurSession.')
  return contexte
}
