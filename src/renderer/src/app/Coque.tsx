import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { useSession } from './Session'
import {
  ContexteNavigation,
  LIBELLES_GROUPE,
  MODULES,
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
  parametres: Parametres
}

export default function Coque() {
  const session = useSession()
  const notifications = useNotifications()

  const accessibles = useMemo(
    () => MODULES.filter((m) => m.permissions.some((p) => session.peut(p))),
    [session]
  )

  const [destination, setDestination] = useState<Destination>({
    module: accessibles[0]?.cle ?? 'tableau-bord'
  })
  const [reduite, setReduite] = useState(false)
  const [menuOuvert, setMenuOuvert] = useState(false)
  const [changementMdp, setChangementMdp] = useState(false)

  const naviguer = useCallback((cible: Destination) => {
    setDestination(cible)
    setMenuOuvert(false)
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

  const parGroupe = useMemo(() => {
    const groupes: Record<string, DefinitionModule[]> = {}
    for (const m of accessibles) {
      ;(groupes[m.groupe] ??= []).push(m)
    }
    return groupes
  }, [accessibles])

  return (
    <ContexteNavigation.Provider value={naviguer}>
      <FournisseurFonctions>
      <div className="application">
        <nav className={`nav${reduite ? ' reduite' : ''}`} aria-label="Navigation principale">
          <div className="nav-entete">
            <span className="nav-logo">
              <Icone nom="produit" taille={15} />
            </span>
            {!reduite ? <span className="nav-marque">PHARMINA</span> : null}
          </div>

          {!reduite ? (
            <div className="nav-officine">
              <strong>{session.pharmacie.nom}</strong>
              {session.pharmacie.ville ?? ''}
            </div>
          ) : null}

          <div className="nav-liste">
            {(['exploitation', 'gestion', 'administration'] as const).map((groupe) => {
              const modules = parGroupe[groupe]
              if (!modules?.length) return null
              return (
                <div key={groupe}>
                  {!reduite ? <div className="nav-groupe">{LIBELLES_GROUPE[groupe]}</div> : null}
                  {modules.map((m) => {
                    const compteur = m.cle === 'alertes' ? (alertes.donnees?.total ?? 0) : 0
                    return (
                      <button
                        key={m.cle}
                        className={`nav-lien${m.cle === moduleCourant.cle ? ' actif' : ''}`}
                        onClick={() => naviguer({ module: m.cle })}
                        title={reduite ? m.libelle : undefined}
                        aria-current={m.cle === moduleCourant.cle ? 'page' : undefined}
                      >
                        <Icone nom={m.icone} />
                        {!reduite ? (
                          <>
                            <span className="nav-lien-libelle">{m.libelle}</span>
                            {compteur > 0 ? <span className="nav-pastille">{compteur}</span> : null}
                          </>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>

          <div className="nav-pied">
            <button className="nav-utilisateur" onClick={() => setMenuOuvert(true)}>
              <span className="nav-avatar">{initiales(session.utilisateur.nom_complet)}</span>
              {!reduite ? (
                <span className="nav-utilisateur-texte">
                  <strong>{session.utilisateur.nom_complet}</strong>
                  <span>{session.utilisateur.role}</span>
                </span>
              ) : null}
            </button>
          </div>
        </nav>

        <div className="zone-travail">
          <header className="barre">
            <BoutonIcone
              icone="panneau"
              titre={reduite ? 'Déployer le menu' : 'Réduire le menu'}
              onClick={() => setReduite((r) => !r)}
            />
            <div className="barre-fil">
              <span>{moduleCourant.fil}</span>
              <Icone nom="chevron-droit" taille={11} />
              <strong>{moduleCourant.libelle}</strong>
            </div>

            <div className="barre-espace" />

            <RechercheGlobale />

            <div className="barre-outils">
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
              <BoutonIcone icone="sortie" titre="Se déconnecter" onClick={() => session.deconnecter()} />
            </div>
          </header>

          <main className="contenu">
            <div className="contenu-large">
              <Ecran destination={destination} />
            </div>
          </main>

          <BarreFonctions />
          <BarreEtat caisse={caisse.donnees} horloge={horloge} />
        </div>
      </div>

      {menuOuvert ? (
        <MenuUtilisateur
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
  onFermer,
  onChangerMotDePasse
}: {
  onFermer: () => void
  onChangerMotDePasse: () => void
}) {
  const session = useSession()

  return (
    <Modale
      titre={session.utilisateur.nom_complet}
      description={`${session.utilisateur.role} · ${session.utilisateur.identifiant}`}
      onFermer={onFermer}
      pied={
        <>
          <Bouton onClick={onFermer}>Fermer</Bouton>
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
