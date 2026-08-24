import { useState, type FormEvent } from 'react'
import type { SessionActive } from '@shared/types'
import { appeler, messageErreur, type ErreurAffichable } from '../lib/api'
import Icone from '../ui/Icone'
import { Bandeau, Bouton, Champ } from '../ui/Composants'

export default function Connexion({
  nomPharmacie,
  onConnecte
}: {
  nomPharmacie: string
  onConnecte: (session: SessionActive) => void
}) {
  const [identifiant, setIdentifiant] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState<ErreurAffichable | null>(null)
  const [enCours, setEnCours] = useState(false)

  async function soumettre(evenement: FormEvent): Promise<void> {
    evenement.preventDefault()
    if (!identifiant.trim() || !motDePasse) return

    setEnCours(true)
    setErreur(null)
    try {
      const session = await appeler<SessionActive>('auth.connecter', {
        identifiant: identifiant.trim(),
        motDePasse
      })
      onConnecte(session)
    } catch (e) {
      setErreur(messageErreur(e))
      setMotDePasse('')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="accueil">
      <form className="accueil-carte" onSubmit={soumettre}>
        <div className="accueil-entete">
          <div className="accueil-logo">
            <Icone nom="produit" taille={22} />
          </div>
          <h1>PHARMINA</h1>
          <p>{nomPharmacie}</p>
        </div>

        <div className="accueil-corps">
          {erreur ? (
            <Bandeau ton={erreur.code === 'verrouille' ? 'attention' : 'danger'}>{erreur.message}</Bandeau>
          ) : null}

          <Champ
            libelle="Identifiant"
            value={identifiant}
            onChange={(e) => setIdentifiant(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
          <Champ
            libelle="Mot de passe"
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            autoComplete="current-password"
            required
          />

          <Bouton
            type="submit"
            variante="principal"
            pleine
            enCours={enCours}
            disabled={!identifiant.trim() || !motDePasse}
          >
            Se connecter
          </Bouton>
        </div>

        <div className="accueil-pied">
          Vos identifiants sont personnels. Toute opération est enregistrée à votre nom.
        </div>
      </form>
    </div>
  )
}
