import { useCallback, useEffect, useState } from 'react'
import type { Pharmacie, SessionActive } from '@shared/types'
import { appeler } from '../lib/api'
import { FournisseurNotifications } from '../ui/Notifications'
import { Chargement, ErreurEcran } from '../ui/Composants'
import { FournisseurSession } from './Session'
import Connexion from './Connexion'
import Configuration from './Configuration'
import Coque from './Coque'

interface EtatApplication {
  besoinConfiguration: boolean
  pharmacie: Pharmacie | null
  dateDuJour: string
}

/**
 * Aiguillage d'ouverture : première configuration, connexion, ou application.
 * Tant que l'état n'est pas connu, rien n'est affiché d'autre qu'un indicateur
 * discret — jamais un écran qui changerait sous les yeux de l'utilisateur.
 */
export default function App() {
  const [etat, setEtat] = useState<EtatApplication | null>(null)
  const [erreur, setErreur] = useState<{ message: string; detail?: string } | null>(null)
  const [session, setSession] = useState<SessionActive | null>(null)

  const charger = useCallback(() => {
    setErreur(null)
    appeler<EtatApplication>('app.etat')
      .then(setEtat)
      .catch(() =>
        setErreur({
          message: 'Impossible de démarrer PHARMINA.',
          detail: "La base de données n'a pas pu être ouverte. Contactez votre administrateur."
        })
      )
  }, [])

  useEffect(charger, [charger])

  if (erreur) {
    return (
      <div className="accueil">
        <div className="accueil-carte">
          <ErreurEcran erreur={erreur} onReessayer={charger} />
        </div>
      </div>
    )
  }

  if (!etat) {
    return (
      <div className="accueil">
        <Chargement libelle="Ouverture de PHARMINA…" />
      </div>
    )
  }

  return (
    <FournisseurNotifications>
      {etat.besoinConfiguration ? (
        <Configuration onTermine={charger} />
      ) : session ? (
        <FournisseurSession session={session} onDeconnexion={() => setSession(null)}>
          <Coque />
        </FournisseurSession>
      ) : (
        <Connexion nomPharmacie={etat.pharmacie?.nom ?? ''} onConnecte={setSession} />
      )}
    </FournisseurNotifications>
  )
}
