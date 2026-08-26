/**
 * Verrouillage du poste.
 *
 * Un comptoir de pharmacie n'est jamais vide très longtemps, mais il l'est
 * parfois : on va chercher une boîte en réserve, on répond au téléphone. Le
 * poste reste alors ouvert, avec la caisse, les prix et les comptes clients.
 *
 * Après quelques minutes sans activité, l'écran se verrouille. La session
 * n'est pas fermée : la vente en cours, le panier, la caisse ouverte, tout
 * reste en place. Il suffit du mot de passe pour reprendre exactement où on
 * en était — et c'est ce qui fait que le réglage ne sera pas désactivé au
 * bout d'une semaine.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { appeler } from '../lib/api'
import { definirPosteVerrouille } from '../lib/codeBarres'
import { useRequete } from '../lib/hooks'
import { useSession } from './Session'
import { Bouton } from '../ui/Composants'
import Icone from '../ui/Icone'

/** Une frappe ou un mouvement ne réarme le compteur qu'une fois par seconde. */
const PAS_MS = 1000

const EVENEMENTS = ['mousedown', 'keydown', 'wheel', 'touchstart', 'mousemove'] as const

interface ValeurVerrou {
  /** Verrouille immédiatement, sans attendre le délai d'inactivité. */
  verrouiller: () => void
}

const ContexteVerrou = createContext<ValeurVerrou | null>(null)

/**
 * Verrouillage à la demande.
 *
 * Le délai d'inactivité protège les oublis ; ce geste-ci protège les départs
 * volontaires. Quelqu'un qui quitte son poste sait qu'il le quitte, et doit
 * pouvoir le fermer sans se déconnecter — donc sans perdre son panier.
 */
export function useVerrou(): ValeurVerrou {
  // Hors du fournisseur (écran de connexion, configuration initiale), il n'y a
  // pas de poste à verrouiller : on ne fait rien plutôt que d'échouer.
  return useContext(ContexteVerrou) ?? { verrouiller: () => {} }
}

export default function VerrouPoste({ children }: { children: ReactNode }) {
  const session = useSession()
  const reglages = useRequete<{ verrouillagePosteMinutes: number }>('app.reglages')
  const minutes = reglages.donnees?.verrouillagePosteMinutes ?? 0

  const [verrouille, setVerrouille] = useState(false)
  const derniereActivite = useRef(Date.now())

  const verrouiller = useCallback(() => {
    setVerrouille(true)
    definirPosteVerrouille(true)
  }, [])

  useEffect(() => {
    if (minutes <= 0 || verrouille) return

    const marquer = (): void => {
      const maintenant = Date.now()
      if (maintenant - derniereActivite.current > PAS_MS) derniereActivite.current = maintenant
    }

    for (const nom of EVENEMENTS) window.addEventListener(nom, marquer, { passive: true })

    // Un intervalle plutôt qu'un minuteur remis à zéro à chaque frappe : au
    // comptoir, les événements arrivent par centaines et reprogrammer un
    // minuteur à chacun coûterait plus que de regarder l'heure.
    const battement = window.setInterval(() => {
      if (Date.now() - derniereActivite.current >= minutes * 60_000) verrouiller()
    }, 5000)

    return () => {
      for (const nom of EVENEMENTS) window.removeEventListener(nom, marquer)
      window.clearInterval(battement)
    }
  }, [minutes, verrouille, verrouiller])

  const valeur = useMemo<ValeurVerrou>(() => ({ verrouiller }), [verrouiller])

  if (!verrouille) return <ContexteVerrou.Provider value={valeur}>{children}</ContexteVerrou.Provider>

  return (
    <ContexteVerrou.Provider value={valeur}>
      {children}
      <EcranVerrou
        nom={session.utilisateur.nom_complet}
        pharmacie={session.pharmacie.nom}
        onOuvert={() => {
          derniereActivite.current = Date.now()
          definirPosteVerrouille(false)
          setVerrouille(false)
        }}
      />
    </ContexteVerrou.Provider>
  )
}

function EcranVerrou({
  nom,
  pharmacie,
  onOuvert
}: {
  nom: string
  pharmacie: string
  onOuvert: () => void
}) {
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const champ = useRef<HTMLInputElement>(null)

  useEffect(() => {
    champ.current?.focus()
  }, [])

  async function deverrouiller(): Promise<void> {
    if (!motDePasse || enCours) return
    setEnCours(true)
    setErreur(null)
    try {
      const bon = await appeler<boolean>('securite.deverrouiller', { motDePasse })
      if (bon) {
        onOuvert()
        return
      }
      setErreur('Mot de passe incorrect.')
      setMotDePasse('')
      champ.current?.focus()
    } catch {
      setErreur('Vérification impossible.')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div
      className="verrou"
      role="dialog"
      aria-modal="true"
      aria-label="Poste verrouillé"
      // Le clavier ne doit pas atteindre l'écran resté monté derrière.
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="verrou-carte">
        <div className="verrou-marque">
          <Icone nom="verrou" taille={20} />
        </div>

        <h1>Poste verrouillé</h1>
        <p className="verrou-officine">{pharmacie}</p>

        <p className="verrou-explication">
          Votre travail est intact. Entrez votre mot de passe pour reprendre où vous en étiez.
        </p>

        <label className="verrou-utilisateur" htmlFor="verrou-mot-de-passe">
          {nom}
        </label>
        <input
          id="verrou-mot-de-passe"
          ref={champ}
          type="password"
          className="verrou-saisie"
          value={motDePasse}
          autoComplete="current-password"
          onChange={(e) => setMotDePasse(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void deverrouiller()
          }}
        />

        {erreur ? <p className="verrou-erreur">{erreur}</p> : null}

        <Bouton
          variante="principal"
          pleine
          enCours={enCours}
          disabled={!motDePasse}
          onClick={() => void deverrouiller()}
        >
          Déverrouiller
        </Bouton>
      </div>
    </div>
  )
}
