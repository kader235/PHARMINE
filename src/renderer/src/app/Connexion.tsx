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
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Pharmacie, SessionActive } from '@shared/types'
import { appeler, messageErreur, type ErreurAffichable } from '../lib/api'
import { dateLongue } from '../lib/format'
import { Bandeau, Bouton, Case, Champ } from '../ui/Composants'

/**
 * Marque du logiciel : la croix de pharmacie aux couleurs du drapeau tchadien.
 *
 * Les separations tombent sur les articulations de la croix — bras gauche,
 * colonne centrale, bras droit — et non sur une grille arbitraire. La forme
 * porte donc les couleurs au lieu de les subir, et les limites restent nettes
 * jusqu'aux tres petites tailles.
 *
 * Dessinee ici plutot qu'importee comme image : c'est la meme geometrie que
 * l'icone de l'application, et elle doit rester nette a toutes les tailles.
 */
export function CroixPharmacie({ taille = 40 }: { taille?: number }) {
  const identifiant = `croix-${taille}`
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={identifiant}>
          <rect x="200" y="104" width="112" height="304" rx="24" />
          <rect x="104" y="200" width="304" height="112" rx="24" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${identifiant})`}>
        <rect x="96" y="96" width="104" height="320" fill="#002664" />
        <rect x="200" y="96" width="112" height="320" fill="#fecb00" />
        <rect x="312" y="96" width="104" height="320" fill="#c60c30" />
      </g>
    </svg>
  )
}

/**
 * Identifiant retenu sur ce poste.
 *
 * Seul l'identifiant est conserve — jamais le mot de passe. C'est la limite a
 * ne pas franchir : un mot de passe enregistre en clair sur le poste
 * annulerait le verrouillage d'ecran, la journalisation nominative et le
 * controle des permissions d'un seul coup.
 *
 * Le choix est propre au poste : le comptoir peut retenir le caissier tandis
 * que le bureau ne retient personne.
 */
const CLE_IDENTIFIANT = 'pharmina.identifiant'

function identifiantRetenu(): string {
  try {
    return localStorage.getItem(CLE_IDENTIFIANT) ?? ''
  } catch {
    return ''
  }
}

function retenirIdentifiant(identifiant: string | null): void {
  try {
    if (identifiant) localStorage.setItem(CLE_IDENTIFIANT, identifiant)
    else localStorage.removeItem(CLE_IDENTIFIANT)
  } catch {
    // Stockage local indisponible : on ne retient rien, la connexion marche.
  }
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
  const retenu = identifiantRetenu()
  const [identifiant, setIdentifiant] = useState(retenu)
  const [motDePasse, setMotDePasse] = useState('')
  const [seSouvenir, setSeSouvenir] = useState(retenu.length > 0)
  const [erreur, setErreur] = useState<ErreurAffichable | null>(null)
  const [enCours, setEnCours] = useState(false)
  const champMotDePasse = useRef<HTMLInputElement>(null)

  // L'identifiant est deja la : c'est le mot de passe qu'on attend. Placer le
  // curseur ailleurs obligerait a une tabulation a chaque ouverture.
  useEffect(() => {
    if (retenu) champMotDePasse.current?.focus()
    // Au premier rendu seulement : ensuite, le curseur appartient a l'utilisateur.
  }, [])

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
      retenirIdentifiant(seSouvenir ? identifiant.trim() : null)
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
              ref={champMotDePasse}
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              autoComplete="current-password"
              required
            />

            <Case
              libelle="Se souvenir de moi sur ce poste"
              checked={seSouvenir}
              onChange={(e) => {
                setSeSouvenir(e.target.checked)
                if (!e.target.checked) retenirIdentifiant(null)
              }}
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
              Seul votre identifiant est retenu, jamais votre mot de passe. Toute opération est
              enregistrée à votre nom.
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
