/**
 * Activation du logiciel.
 *
 * Le pharmacien lit son code d'installation, l'envoie à son fournisseur par le
 * moyen qu'il veut, et colle la clé reçue. Rien d'autre : pas de compte à
 * créer, pas de connexion Internet, pas de serveur à joindre. Une officine de
 * N'Djamena dont la ligne est coupée doit pouvoir activer son logiciel.
 */
import { useState } from 'react'
import { appeler, messageErreur } from '../lib/api'
import { useRequete } from '../lib/hooks'
import { Bandeau, Bouton, Champ, Modale, Panneau } from '../ui/Composants'

export interface EtatLicence {
  activee: boolean
  codeInstallation: string
  expiration: string | null
  joursRestants: number | null
  ventesDuJour: number
  ventesMaximum: number
  jourEffectif: string
  horlogeSuspecte: boolean
  reculs: number
  bonds: number
}

export function useLicence(): {
  etat: EtatLicence | null
  recharger: () => void
} {
  const requete = useRequete<EtatLicence>('licence.etat')
  return { etat: requete.donnees, recharger: requete.recharger }
}

/**
 * Bandeau de démonstration.
 *
 * Discret mais permanent : il rappelle la limite du jour sans occuper l'écran.
 * Il devient pressant quand le quota approche — c'est le moment où l'on décide
 * d'acheter, pas trois jours plus tard.
 */
export function BandeauDemonstration({
  etat,
  onActiver
}: {
  etat: EtatLicence
  onActiver: () => void
}) {
  if (etat.activee) return null

  const restantes = Math.max(0, etat.ventesMaximum - etat.ventesDuJour)
  const serre = restantes <= 3

  return (
    <div className={`bandeau-demo${serre ? ' serre' : ''}`}>
      <span className="bandeau-demo-marque">Démonstration</span>
      <span className="bandeau-demo-texte">
        {restantes > 0
          ? `${restantes} vente${restantes > 1 ? 's' : ''} encore possible${restantes > 1 ? 's' : ''} aujourd’hui`
          : 'Quota du jour atteint — les ventes reprendront demain'}
      </span>
      <button type="button" className="bandeau-demo-action" onClick={onActiver}>
        Activer le logiciel
      </button>
    </div>
  )
}

export function FenetreActivation({
  etat,
  onFermer,
  onActive
}: {
  etat: EtatLicence
  onFermer: () => void
  onActive: () => void
}) {
  const [cle, setCle] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [copie, setCopie] = useState(false)

  async function activer(): Promise<void> {
    if (!cle.trim() || enCours) return
    setEnCours(true)
    setErreur(null)
    try {
      await appeler('licence.activer', { cle })
      onActive()
    } catch (e) {
      setErreur(messageErreur(e).message)
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Modale titre={etat.activee ? 'Licence du logiciel' : 'Activer PHARMINA'} large onFermer={onFermer}>
      <div className="panneau-corps pile">
        {etat.activee ? (
          <Bandeau ton="succes" titre="Ce poste est activé">
            {etat.expiration
              ? `Licence valable jusqu’au ${etat.expiration}.`
              : 'Licence perpétuelle.'}
          </Bandeau>
        ) : null}

        <p className="activation-explication">
          Communiquez le code ci-dessous à votre fournisseur — par téléphone, message ou courriel.
          Il vous renverra une clé à coller ici. Aucune connexion Internet n’est nécessaire.
        </p>

        <Panneau titre="Code d’installation de ce poste">
          <p className="activation-code">{etat.codeInstallation}</p>
          <div className="rangee" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            <Bouton
              compact
              onClick={() => {
                void navigator.clipboard.writeText(etat.codeInstallation)
                setCopie(true)
              }}
            >
              {copie ? 'Copié' : 'Copier le code'}
            </Bouton>
          </div>
        </Panneau>

        {/* Le champ reste disponible même une fois activé : on remplace une
            licence annuelle arrivée à terme sans désinstaller quoi que ce soit. */}
        <Champ
          libelle="Clé d’activation reçue"
          large
          value={cle}
          onChange={(e) => setCle(e.target.value)}
          placeholder="Collez ici la clé communiquée par votre fournisseur"
          aide="Les tirets, espaces et majuscules n’ont pas d’importance."
        />

        {erreur ? <Bandeau ton="danger">{erreur}</Bandeau> : null}

        <div className="rangee" style={{ justifyContent: 'flex-end' }}>
          <Bouton
            variante="principal"
            enCours={enCours}
            disabled={cle.trim().length < 20}
            onClick={activer}
          >
            {etat.activee ? 'Remplacer la licence' : 'Activer'}
          </Bouton>
        </div>

        {etat.activee ? null : (
          <Panneau titre="Ce que permet la démonstration">
            <ul className="liste-limites">
              <li>
                <strong>{etat.ventesMaximum} ventes par jour.</strong> Tout le reste du comptoir
                fonctionne : recherche, lecteur de codes-barres, crédits, impression.
              </li>
              <li>
                <strong>Catalogue, stock, achats, clients, caisse et inventaire</strong> sans
                limite : c’est là qu’on juge un logiciel de pharmacie.
              </li>
              <li>
                <strong>Rapports et exports réservés</strong> à la version complète.
              </li>
              <li>
                <strong>Vos sauvegardes fonctionnent</strong> dès la démonstration. La sécurité de
                vos données n’est pas une option payante.
              </li>
            </ul>

            {etat.horlogeSuspecte ? (
              <div style={{ marginTop: 12 }}>
                <Bandeau ton="attention" titre="Horloge modifiée">
                  La date de cet ordinateur a été reculée {etat.reculs} fois. Le logiciel continue
                  de compter à partir du {etat.jourEffectif}.
                </Bandeau>
              </div>
            ) : null}
          </Panneau>
        )}
      </div>
    </Modale>
  )
}
