import { useState } from 'react'
import { appeler, messageErreur, type ErreurAffichable } from '../lib/api'
import Icone from '../ui/Icone'
import { Bandeau, Bouton, Champ, Liste } from '../ui/Composants'

const DEVISES = [
  { valeur: 'XOF|FCFA|0', libelle: 'Franc CFA (UEMOA) — FCFA' },
  { valeur: 'XAF|FCFA|0', libelle: 'Franc CFA (CEMAC) — FCFA' },
  { valeur: 'EUR|€|2', libelle: 'Euro — €' },
  { valeur: 'USD|$|2', libelle: 'Dollar américain — $' },
  { valeur: 'MAD|DH|2', libelle: 'Dirham marocain — DH' },
  { valeur: 'DZD|DA|2', libelle: 'Dinar algérien — DA' },
  { valeur: 'TND|DT|3', libelle: 'Dinar tunisien — DT' },
  { valeur: 'GNF|FG|0', libelle: 'Franc guinéen — FG' },
  { valeur: 'NGN|₦|2', libelle: 'Naira nigérian — ₦' }
]

interface DonneesOfficine {
  nom: string
  ville: string
  pays: string
  telephone: string
  email: string
  registreCommerce: string
  devise: string
}

interface DonneesAdmin {
  nomComplet: string
  identifiant: string
  motDePasse: string
  confirmation: string
}

/**
 * Première configuration.
 *
 * Deux étapes seulement : l'officine et son premier responsable. Le reste
 * (produits, stock, caisse) se fait dans le logiciel, où l'utilisateur dispose
 * de tous les outils — l'obliger à tout saisir avant d'avoir vu l'application
 * serait une perte de temps.
 */
export default function Configuration({ onTermine }: { onTermine: () => void }) {
  const [etape, setEtape] = useState<1 | 2>(1)
  const [erreur, setErreur] = useState<ErreurAffichable | null>(null)
  const [enCours, setEnCours] = useState(false)

  const [officine, setOfficine] = useState<DonneesOfficine>({
    nom: '',
    ville: '',
    pays: '',
    telephone: '',
    email: '',
    registreCommerce: '',
    devise: 'XOF|FCFA|0'
  })

  const [admin, setAdmin] = useState<DonneesAdmin>({
    nomComplet: '',
    identifiant: '',
    motDePasse: '',
    confirmation: ''
  })

  const officineValide = officine.nom.trim().length >= 2
  const motDePasseValide =
    admin.motDePasse.length >= 8 && /[A-Za-z]/.test(admin.motDePasse) && /[0-9]/.test(admin.motDePasse)
  const adminValide =
    admin.nomComplet.trim().length >= 3 &&
    admin.identifiant.trim().length >= 3 &&
    motDePasseValide &&
    admin.motDePasse === admin.confirmation

  async function terminer(): Promise<void> {
    setEnCours(true)
    setErreur(null)

    const [code, symbole, decimales] = officine.devise.split('|')

    try {
      await appeler('app.configurer', {
        pharmacie: {
          nom: officine.nom.trim(),
          ville: officine.ville.trim() || null,
          pays: officine.pays.trim() || null,
          telephone: officine.telephone.trim() || null,
          email: officine.email.trim() || null,
          registreCommerce: officine.registreCommerce.trim() || null,
          devise: code,
          deviseSymbole: symbole,
          deviseDecimales: Number(decimales)
        },
        administrateur: {
          nomComplet: admin.nomComplet.trim(),
          identifiant: admin.identifiant.trim().toLowerCase(),
          motDePasse: admin.motDePasse
        }
      })
      onTermine()
    } catch (e) {
      setErreur(messageErreur(e))
      setEnCours(false)
    }
  }

  return (
    <div className="accueil">
      <div className="accueil-carte large">
        <div className="accueil-entete">
          <div className="accueil-logo">
            <Icone nom="produit" taille={22} />
          </div>
          <h1>PHARMINA</h1>
          <p>Configurons votre pharmacie. Deux étapes suffisent pour commencer.</p>
        </div>

        <div className="etapes">
          <div className={`etape ${etape === 1 ? 'active' : 'faite'}`}>
            <span className="etape-puce">{etape > 1 ? <Icone nom="coche" taille={11} /> : '1'}</span>
            Votre pharmacie
          </div>
          <span className="etape-trait" />
          <div className={`etape ${etape === 2 ? 'active' : ''}`}>
            <span className="etape-puce">2</span>
            Votre compte
          </div>
        </div>

        <div className="accueil-corps">
          {erreur ? <Bandeau ton="danger">{erreur.message}</Bandeau> : null}

          {etape === 1 ? (
            <>
              <Champ
                libelle="Nom de la pharmacie"
                obligatoire
                value={officine.nom}
                onChange={(e) => setOfficine({ ...officine, nom: e.target.value })}
                placeholder="Pharmacie du Plateau"
                autoFocus
              />
              <div className="grille deux">
                <Champ
                  libelle="Ville"
                  value={officine.ville}
                  onChange={(e) => setOfficine({ ...officine, ville: e.target.value })}
                />
                <Champ
                  libelle="Pays"
                  value={officine.pays}
                  onChange={(e) => setOfficine({ ...officine, pays: e.target.value })}
                />
                <Champ
                  libelle="Téléphone"
                  value={officine.telephone}
                  onChange={(e) => setOfficine({ ...officine, telephone: e.target.value })}
                />
                <Champ
                  libelle="Adresse électronique"
                  type="email"
                  value={officine.email}
                  onChange={(e) => setOfficine({ ...officine, email: e.target.value })}
                />
              </div>
              <Liste
                libelle="Devise"
                obligatoire
                aide="Elle détermine l'affichage de tous les montants. Modifiable ensuite dans les paramètres."
                options={DEVISES}
                value={officine.devise}
                onChange={(e) => setOfficine({ ...officine, devise: e.target.value })}
              />
              <Champ
                libelle="Registre de commerce"
                value={officine.registreCommerce}
                onChange={(e) => setOfficine({ ...officine, registreCommerce: e.target.value })}
                aide="Figurera sur vos documents. Facultatif."
              />

              <Bouton variante="principal" pleine disabled={!officineValide} onClick={() => setEtape(2)}>
                Continuer
              </Bouton>
            </>
          ) : (
            <>
              <Bandeau ton="info">
                Ce compte sera administrateur : il pourra tout faire, y compris créer les autres
                utilisateurs et définir leurs droits.
              </Bandeau>

              <Champ
                libelle="Nom complet"
                obligatoire
                value={admin.nomComplet}
                onChange={(e) => setAdmin({ ...admin, nomComplet: e.target.value })}
                placeholder="Marie Dupont"
                autoFocus
              />
              <Champ
                libelle="Identifiant de connexion"
                obligatoire
                value={admin.identifiant}
                onChange={(e) => setAdmin({ ...admin, identifiant: e.target.value })}
                placeholder="marie"
                aide="Court et simple à saisir plusieurs fois par jour."
              />
              <div className="grille deux">
                <Champ
                  libelle="Mot de passe"
                  obligatoire
                  type="password"
                  value={admin.motDePasse}
                  onChange={(e) => setAdmin({ ...admin, motDePasse: e.target.value })}
                  aide="8 caractères minimum, avec au moins une lettre et un chiffre."
                  erreur={
                    admin.motDePasse && !motDePasseValide
                      ? 'Il manque une lettre, un chiffre, ou la longueur minimale.'
                      : undefined
                  }
                />
                <Champ
                  libelle="Confirmation"
                  obligatoire
                  type="password"
                  value={admin.confirmation}
                  onChange={(e) => setAdmin({ ...admin, confirmation: e.target.value })}
                  erreur={
                    admin.confirmation && admin.motDePasse !== admin.confirmation
                      ? 'Les deux mots de passe diffèrent.'
                      : undefined
                  }
                />
              </div>

              <div className="rangee">
                <Bouton onClick={() => setEtape(1)} icone="chevron-gauche">
                  Retour
                </Bouton>
                <Bouton
                  variante="principal"
                  disabled={!adminValide}
                  enCours={enCours}
                  onClick={terminer}
                  style={{ flex: 1 }}
                >
                  Terminer la configuration
                </Bouton>
              </div>
            </>
          )}
        </div>

        <div className="accueil-pied">
          Vos données restent sur cet ordinateur. Aucune information n’est transmise à l’extérieur.
        </div>
      </div>
    </div>
  )
}
