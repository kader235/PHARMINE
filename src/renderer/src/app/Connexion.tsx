/**
 * Écran de connexion.
 *
 * Une seule carte, posée sur un fond calme. À gauche, la seule chose à faire :
 * entrer son identifiant. À droite, l'identité — celle de l'officine avant
 * celle du logiciel, parce que c'est le premier écran que voit quelqu'un qui
 * arrive le matin, et qu'il doit reconnaître sa pharmacie.
 *
 * Le panneau porte aussi la date et la version. Ce n'est pas de l'ornement :
 * c'est ce qu'on demande au téléphone quand on assiste un poste à distance, et
 * le faire chercher dans un menu coûte une minute à chaque appel.
 *
 * Rien ne flotte, rien ne décore. Le soin est dans les proportions et dans la
 * typographie, pas dans des formes ajoutées.
 */
import { useState, type FormEvent } from 'react'
import type { Pharmacie, SessionActive } from '@shared/types'
import { appeler, messageErreur, type ErreurAffichable } from '../lib/api'
import { dateLongue } from '../lib/format'
import { Bandeau, Bouton, Champ } from '../ui/Composants'

/**
 * La croix verte, dessinée ici plutôt qu'importée : c'est la marque du
 * logiciel, la même que l'icône de l'application, et elle doit rester nette à
 * toutes les tailles.
 */
export function CroixPharmacie({ taille = 40 }: { taille?: number }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="currentColor">
        <rect x="200" y="104" width="112" height="304" rx="24" />
        <rect x="104" y="200" width="304" height="112" rx="24" />
      </g>
    </svg>
  )
}

export default function Connexion({
  pharmacie,
  dateDuJour,
  version,
  onConnecte
}: {
  pharmacie: Pharmacie | null
  dateDuJour: string
  version: string
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

  const lieu = [pharmacie?.ville, pharmacie?.pays].filter(Boolean).join(' · ')

  return (
    <div className="connexion">
      <div className="connexion-carte">
        <main className="connexion-acces">
          <form className="connexion-formulaire" onSubmit={soumettre}>
            <h1>Connexion</h1>
            <p className="connexion-invite">Identifiez-vous pour ouvrir le comptoir.</p>

            {erreur ? (
              <Bandeau ton={erreur.code === 'verrouille' ? 'attention' : 'danger'}>
                {erreur.message}
              </Bandeau>
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

            <p className="connexion-note">
              Vos identifiants sont personnels. Toute opération est enregistrée à votre nom.
            </p>
          </form>
        </main>

        <aside className="connexion-marque">
          <div className="connexion-identite">
            <span className="connexion-croix">
              <CroixPharmacie taille={34} />
            </span>
            <div>
              <p className="connexion-produit">PHARMINA</p>
              <p className="connexion-metier">Gestion de pharmacie</p>
            </div>
          </div>

          <div className="connexion-officine">
            <p className="connexion-officine-nom">{pharmacie?.nom ?? 'Pharmacie'}</p>
            {lieu ? <p className="connexion-officine-lieu">{lieu}</p> : null}
          </div>

          <div className="connexion-pied-marque">
            <span>{dateLongue(dateDuJour)}</span>
            <span>Version {version}</span>
          </div>
        </aside>

      </div>
    </div>
  )
}
