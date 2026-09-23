import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useSession } from './Session'
import { useVerrou } from './Verrou'
import { BandeauDemonstration, FenetreActivation, useLicence } from './Licence'
import { CroixPharmacie } from './Connexion'
import {
  ContexteNavigation,
  LIBELLES_GROUPE,
  MODULES,
  MODULES_BARRE,
  type CleModule,
  type Destination,
  type DefinitionModule
} from './navigation'
import RechercheGlobale from './RechercheGlobale'
import { BarreEtat, BarreFonctions } from './Barres'
import { FournisseurFonctions } from './fonctions'
import Icone from '../ui/Icone'
import { BoutonIcone, Bouton, Modale, Champ, Bandeau } from '../ui/Composants'
import { useNotifications } from '../ui/Notifications'
import { useRequete, useAction, useRaccourci } from '../lib/hooks'
import { heure, initiales } from '../lib/format'
import { ecouterCaisseModifiee } from '../lib/evenements'
import {
  DISPOSITIONS,
  THEMES,
  appliquerApparence,
  dispositionDuPoste,
  retenirApparence,
  themeDuPoste,
  type CleDisposition,
  type CleTheme
} from './themes'
import type { EtatCaisse } from '@shared/types'

import TableauDeBord from '../modules/TableauDeBord'
import Ventes from '../modules/Ventes'
import Caisse from '../modules/Caisse'
import Produits from '../modules/Produits'
import Stock from '../modules/Stock'
import Peremptions from '../modules/Peremptions'
import Achats from '../modules/Achats'
import Fournisseurs from '../modules/Fournisseurs'
import Clients from '../modules/Clients'
import Inventaire from '../modules/Inventaire'
import Finances from '../modules/Finances'
import Rapports from '../modules/Rapports'
import Alertes from '../modules/Alertes'
import Utilisateurs from '../modules/Utilisateurs'
import Journal from '../modules/Journal'
import Parametres from '../modules/Parametres'
import Aide from '../modules/Aide'

export interface ProprietesModule {
  destination: Destination
}

const ECRANS: Record<CleModule, (p: ProprietesModule) => ReactElement> = {
  'tableau-bord': TableauDeBord,
  ventes: Ventes,
  caisse: Caisse,
  produits: Produits,
  stock: Stock,
  peremptions: Peremptions,
  achats: Achats,
  fournisseurs: Fournisseurs,
  clients: Clients,
  inventaire: Inventaire,
  finances: Finances,
  rapports: Rapports,
  alertes: Alertes,
  utilisateurs: Utilisateurs,
  journal: Journal,
  parametres: Parametres,
  aide: Aide
}

export default function Coque() {
  const session = useSession()
  const notifications = useNotifications()

  const accessibles = useMemo(
    // Une liste de permissions vide signifie « visible par tout le monde » :
    // c'est le cas du guide d'utilisation, que la personne embauchee hier doit
    // pouvoir ouvrir.
    () =>
      MODULES.filter(
        (m) => m.permissions.length === 0 || m.permissions.some((p) => session.peut(p))
      ),
    [session]
  )

  const [destination, setDestination] = useState<Destination>({
    module: accessibles[0]?.cle ?? 'tableau-bord'
  })
  const [plusOuvert, setPlusOuvert] = useState(false)
  const [menuOuvert, setMenuOuvert] = useState(false)
  const [activationOuverte, setActivationOuverte] = useState(false)
  const licence = useLicence()
  const [changementMdp, setChangementMdp] = useState(false)
  const [themeCourant, setThemeCourant] = useState<CleTheme>(() => themeDuPoste())
  const [dispositionCourante, setDispositionCourante] = useState<CleDisposition>(() =>
    dispositionDuPoste()
  )

  function changerApparence(cleTheme: CleTheme, cleDisposition: CleDisposition): void {
    appliquerApparence(cleTheme, cleDisposition)
    retenirApparence(cleTheme, cleDisposition)
    setThemeCourant(cleTheme)
    setDispositionCourante(cleDisposition)
  }

  const naviguer = useCallback((cible: Destination) => {
    setDestination(cible)
    setMenuOuvert(false)
    setPlusOuvert(false)
    document.querySelector('.contenu')?.scrollTo({ top: 0 })
  }, [])

  const alertes = useRequete<{ urgent: number; important: number; total: number }>('alertes.compter')
  const caisse = useRequete<EtatCaisse>('caisse.etat')
  const [horloge, setHorloge] = useState(() => heure(new Date().toISOString()))

  // L'heure de la barre d'état se remet à jour toutes les trente secondes :
  // suffisant pour rester juste, assez rare pour ne rien coûter.
  useEffect(() => {
    const minuteur = setInterval(() => setHorloge(heure(new Date().toISOString())), 30_000)
    return () => clearInterval(minuteur)
  }, [])

  // Une vente ou un mouvement de caisse met la barre d'état à jour aussitôt,
  // sans attendre un changement d'écran.
  useEffect(() => ecouterCaisseModifiee(() => caisse.recharger()), [caisse.recharger])

  // Le compteur d'alertes se rafraîchit à chaque changement d'écran : il reste
  // juste sans imposer de sondage permanent.
  useEffect(() => {
    alertes.recharger()
    caisse.recharger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination.module])

  useRaccourci('F2', () => {
    if (session.peut('ventes.creer')) naviguer({ module: 'ventes' })
  })

  const moduleCourant = MODULES.find((m) => m.cle === destination.module) ?? accessibles[0]!
  const Ecran = ECRANS[moduleCourant.cle]

  // Ce qui tient dans la barre, et ce qui va sous « Plus ». L'ordre de la barre
  // est celui de MODULES_BARRE — celui de la journée — et non celui du
  // catalogue des modules.
  const dansLaBarre = useMemo(
    () =>
      MODULES_BARRE.map((cle) => accessibles.find((m) => m.cle === cle)).filter(
        (m): m is DefinitionModule => Boolean(m)
      ),
    [accessibles]
  )
  const sousPlus = useMemo(
    () => accessibles.filter((m) => !MODULES_BARRE.includes(m.cle)),
    [accessibles]
  )

  // Le menu « Plus » se referme quand on clique ailleurs. Sans cela il reste
  // ouvert par-dessus l'écran et il faut deviner qu'un second clic sur « Plus »
  // le ferme.
  const boitePlus = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!plusOuvert) return
    const fermer = (evenement: MouseEvent): void => {
      if (!boitePlus.current?.contains(evenement.target as Node)) setPlusOuvert(false)
    }
    const echapper = (evenement: KeyboardEvent): void => {
      if (evenement.key === 'Escape') setPlusOuvert(false)
    }
    document.addEventListener('mousedown', fermer)
    document.addEventListener('keydown', echapper)
    return () => {
      document.removeEventListener('mousedown', fermer)
      document.removeEventListener('keydown', echapper)
    }
  }, [plusOuvert])

  return (
    <ContexteNavigation.Provider value={naviguer}>
      <FournisseurFonctions>
      <div className="application">
        <nav className="nav" aria-label="Navigation principale">
          <div className="nav-entete">
            <span className="nav-logo">
              <CroixPharmacie taille={19} />
            </span>
            <span className="nav-marque">
              <strong>PHARMINA</strong>
              <span>Gestion de pharmacie</span>
            </span>
          </div>

          <div className="nav-liste">
            {dansLaBarre.map((m) => (
              <button
                key={m.cle}
                className={`nav-lien${m.cle === moduleCourant.cle ? ' actif' : ''}`}
                onClick={() => naviguer({ module: m.cle })}
                aria-current={m.cle === moduleCourant.cle ? 'page' : undefined}
              >
                <span className="nav-pastille-module" aria-hidden="true">
                  <Icone nom={m.icone} taille={18} />
                </span>
                <span className="nav-lien-libelle">{m.libelle}</span>
              </button>
            ))}

            {sousPlus.length ? (
              <div className="nav-plus" ref={boitePlus}>
                <button
                  className={`nav-lien${sousPlus.some((m) => m.cle === moduleCourant.cle) ? ' actif' : ''}`}
                  onClick={() => setPlusOuvert((o) => !o)}
                  aria-expanded={plusOuvert}
                >
                  <span className="nav-lien-libelle">Plus</span>
                  <Icone nom="chevron-bas" taille={13} />
                </button>

                {plusOuvert ? (
                  <div className="nav-deroulant" role="menu">
                    {(['exploitation', 'gestion', 'administration'] as const).map((groupe) => {
                      const modules = sousPlus.filter((m) => m.groupe === groupe)
                      if (!modules.length) return null
                      return (
                        <div key={groupe}>
                          <div className="nav-deroulant-groupe">{LIBELLES_GROUPE[groupe]}</div>
                          {modules.map((m) => {
                            const compteur = m.cle === 'alertes' ? (alertes.donnees?.total ?? 0) : 0
                            return (
                              <button
                                key={m.cle}
                                className={`nav-lien${m.cle === moduleCourant.cle ? ' actif' : ''}`}
                                onClick={() => naviguer({ module: m.cle })}
                                role="menuitem"
                              >
                                <span className="nav-pastille-module" aria-hidden="true">
                                  <Icone nom={m.icone} taille={18} />
                                </span>
                                <span className="nav-lien-libelle">{m.libelle}</span>
                                {compteur > 0 ? (
                                  <span className="nav-pastille">{compteur}</span>
                                ) : null}
                              </button>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="nav-espace" />

          <RechercheGlobale />

          <div className="nav-outils">
            {session.peut('alertes.voir') ? (
              <BoutonIcone
                icone="alerte"
                titre={
                  alertes.donnees?.total
                    ? `${alertes.donnees.total} alerte(s) en cours`
                    : 'Aucune alerte en cours'
                }
                point={(alertes.donnees?.urgent ?? 0) > 0}
                onClick={() => naviguer({ module: 'alertes' })}
              />
            ) : null}
            <BoutonIcone
              icone="sortie"
              titre="Se déconnecter"
              onClick={() => session.deconnecter()}
            />

            <button
              className="barre-utilisateur"
              onClick={() => setMenuOuvert(true)}
              title="Mon compte et apparence"
            >
              <span className="nav-avatar">{initiales(session.utilisateur.nom_complet)}</span>
              <span className="barre-utilisateur-texte">
                <strong>{session.utilisateur.nom_complet}</strong>
                <span>{session.utilisateur.role}</span>
              </span>
              <Icone nom="chevron-bas" taille={13} />
            </button>
          </div>
        </nav>

        <div className="zone-travail">
          <main className="contenu">
            <div className="contenu-large">
              <Ecran destination={destination} />
            </div>
          </main>

          {licence.etat ? (
            <BandeauDemonstration etat={licence.etat} onActiver={() => setActivationOuverte(true)} />
          ) : null}

          <BarreFonctions />
          <BarreEtat
            caisse={caisse.donnees}
            horloge={horloge}
            onMiseAJour={() => naviguer({ module: 'parametres', filtre: 'sauvegardes' })}
          />
        </div>
      </div>

      {activationOuverte && licence.etat ? (
        <FenetreActivation
          etat={licence.etat}
          onFermer={() => setActivationOuverte(false)}
          onActive={() => {
            setActivationOuverte(false)
            licence.recharger()
          }}
        />
      ) : null}

      {menuOuvert ? (
        <MenuUtilisateur
          themeCourant={themeCourant}
          dispositionCourante={dispositionCourante}
          onChangerApparence={changerApparence}
          onFermer={() => setMenuOuvert(false)}
          onChangerMotDePasse={() => {
            setMenuOuvert(false)
            setChangementMdp(true)
          }}
        />
      ) : null}

      {changementMdp ? (
        <ChangementMotDePasse
          onFermer={() => setChangementMdp(false)}
          onSucces={() => {
            setChangementMdp(false)
            notifications.succes('Mot de passe modifié')
          }}
        />
      ) : null}
      </FournisseurFonctions>
    </ContexteNavigation.Provider>
  )
}

function MenuUtilisateur({
  themeCourant,
  dispositionCourante,
  onChangerApparence,
  onFermer,
  onChangerMotDePasse
}: {
  themeCourant: CleTheme
  dispositionCourante: CleDisposition
  onChangerApparence: (theme: CleTheme, disposition: CleDisposition) => void
  onFermer: () => void
  onChangerMotDePasse: () => void
}) {
  const session = useSession()
  const verrou = useVerrou()

  return (
    <Modale
      titre={session.utilisateur.nom_complet}
      description={`${session.utilisateur.role} · ${session.utilisateur.identifiant}`}
      onFermer={onFermer}
      pied={
        <>
          <Bouton onClick={onFermer}>Fermer</Bouton>
          {/* Verrouiller plutôt que se déconnecter : on quitte le comptoir
              deux minutes sans perdre le panier en cours. */}
          <Bouton
            icone="verrou"
            onClick={() => {
              onFermer()
              verrou.verrouiller()
            }}
          >
            Verrouiller le poste
          </Bouton>
          <Bouton variante="danger" icone="sortie" onClick={() => session.deconnecter()}>
            Se déconnecter
          </Bouton>
        </>
      }
    >
      <div className="panneau-corps pile">
        <dl className="liste-definitions">
          <dt>Rôle</dt>
          <dd>{session.utilisateur.role}</dd>
          <dt>Permissions</dt>
          <dd>{session.permissions.size}</dd>
          <dt>Dernière connexion</dt>
          <dd>{session.utilisateur.derniere_connexion_at ? 'Cette session' : '—'}</dd>
        </dl>
        <Bouton icone="verrou" onClick={onChangerMotDePasse}>
          Changer mon mot de passe
        </Bouton>

        <div>
          <div className="formulaire-titre">Thème</div>
          <div className="choix-themes">
            {THEMES.map((t) => (
              <button
                key={t.cle}
                type="button"
                className={`choix-theme${t.cle === themeCourant ? ' actif' : ''}`}
                onClick={() => onChangerApparence(t.cle, dispositionCourante)}
                aria-pressed={t.cle === themeCourant}
              >
                <span
                  className="choix-pastille"
                  aria-hidden="true"
                  style={{ background: `linear-gradient(135deg, ${t.pastille[0]} 50%, ${t.pastille[1]} 50%)` }}
                />
                {t.nom}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="formulaire-titre">Disposition</div>
          <div className="choix-dispositions">
            {DISPOSITIONS.map((d) => (
              <button
                key={d.cle}
                type="button"
                className={`choix-theme${d.cle === dispositionCourante ? ' actif' : ''}`}
                onClick={() => onChangerApparence(themeCourant, d.cle)}
                aria-pressed={d.cle === dispositionCourante}
                title={d.description}
              >
                {d.nom}
              </button>
            ))}
          </div>
          <p style={{ marginTop: 8, fontSize: 11, color: 'var(--texte-faible)' }}>
            Ce choix ne vaut que pour cet ordinateur. Le thème appliqué par défaut aux
            nouveaux postes se règle dans Paramètres.
          </p>
        </div>
      </div>
    </Modale>
  )
}

function ChangementMotDePasse({ onFermer, onSucces }: { onFermer: () => void; onSucces: () => void }) {
  const [ancien, setAncien] = useState('')
  const [nouveau, setNouveau] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const action = useAction()

  const valide =
    ancien.length > 0 &&
    nouveau.length >= 8 &&
    /[A-Za-z]/.test(nouveau) &&
    /[0-9]/.test(nouveau) &&
    nouveau === confirmation

  async function enregistrer(): Promise<void> {
    const resultat = await action.executer('auth.changerMotDePasse', { ancien, nouveau })
    if (resultat !== null) onSucces()
  }

  return (
    <Modale
      titre="Changer mon mot de passe"
      onFermer={onFermer}
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="principal" disabled={!valide} enCours={action.enCours} onClick={enregistrer}>
            Enregistrer
          </Bouton>
        </>
      }
    >
      <div className="panneau-corps pile">
        {action.erreur ? <Bandeau ton="danger">{action.erreur.message}</Bandeau> : null}
        <Champ
          libelle="Mot de passe actuel"
          type="password"
          value={ancien}
          onChange={(e) => setAncien(e.target.value)}
          autoComplete="current-password"
        />
        <Champ
          libelle="Nouveau mot de passe"
          type="password"
          value={nouveau}
          onChange={(e) => setNouveau(e.target.value)}
          aide="8 caractères minimum, avec au moins une lettre et un chiffre."
          autoComplete="new-password"
        />
        <Champ
          libelle="Confirmation"
          type="password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          erreur={confirmation && nouveau !== confirmation ? 'Les deux mots de passe diffèrent.' : undefined}
          autoComplete="new-password"
        />
      </div>
    </Modale>
  )
}
