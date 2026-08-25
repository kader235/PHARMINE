import { Fragment, useState } from 'react'
import type { CaisseSession, EtatCaisse } from '@shared/types'
import { useAction, useRequete } from '../lib/hooks'
import { useSession } from '../app/Session'
import { useFonctions } from '../app/fonctions'
import { useNotifications } from '../ui/Notifications'
import { signalerCaisseModifiee } from '../lib/evenements'
import {
  Bandeau,
  Bouton,
  Chargement,
  ChampMontant,
  EntetePage,
  ErreurEcran,
  Etiquette,
  EtatVide,
  Indicateur,
  Liste,
  Modale,
  Panneau,
  Segments,
  ZoneTexte
} from '../ui/Composants'
import Tableau, { CellulePrincipale } from '../ui/Tableau'
import { dateCourte, heure, modePaiement, montant } from '../lib/format'

export default function Caisse() {
  const session = useSession()
  const notifications = useNotifications()
  const [onglet, setOnglet] = useState<'courante' | 'historique'>('courante')
  const [dialogue, setDialogue] = useState<'ouvrir' | 'cloturer' | 'mouvement' | null>(null)

  const etat = useRequete<EtatCaisse>('caisse.etat')
  const caisseOuverte = etat.donnees?.session != null

  useFonctions('caisse', [
    {
      touche: 'F2',
      libelle: caisseOuverte ? 'Clôturer la caisse' : 'Ouvrir la caisse',
      action: () => setDialogue(caisseOuverte ? 'cloturer' : 'ouvrir'),
      disponible: session.peut(caisseOuverte ? 'caisse.cloturer' : 'caisse.ouvrir'),
      saillante: true
    },
    {
      touche: 'F3',
      libelle: 'Mouvement de caisse',
      action: () => setDialogue('mouvement'),
      disponible: caisseOuverte && session.peut('caisse.mouvement')
    },
    { touche: 'F5', libelle: 'Actualiser', action: () => etat.recharger() },
    {
      touche: 'F7',
      libelle: 'Historique des sessions',
      action: () => setOnglet((o) => (o === 'historique' ? 'courante' : 'historique')),
      disponible: session.peut('caisse.ecarts')
    }
  ])

  function apres(message: string): void {
    setDialogue(null)
    etat.recharger()
    signalerCaisseModifiee()
    notifications.succes(message)
  }

  if (etat.erreur) return <ErreurEcran erreur={etat.erreur} onReessayer={etat.recharger} />
  if (!etat.donnees) return <Chargement />

  const c = etat.donnees
  const ouverte = c.session !== null

  return (
    <>
      <EntetePage
        titre="Caisse"
        description={
          ouverte
            ? `Session ${c.session!.reference}, ouverte à ${heure(c.session!.ouverte_at)} par ${c.session!.utilisateur}`
            : 'Aucune caisse ouverte actuellement.'
        }
        actions={
          <>
            {session.peut('caisse.ecarts') ? (
              <Segments
                valeur={onglet}
                options={[
                  { valeur: 'courante', libelle: 'Session en cours' },
                  { valeur: 'historique', libelle: 'Historique' }
                ]}
                onChange={setOnglet}
              />
            ) : null}
            {onglet === 'courante' && ouverte && session.peut('caisse.mouvement') ? (
              <Bouton icone="plus" onClick={() => setDialogue('mouvement')}>
                Mouvement
              </Bouton>
            ) : null}
            {onglet === 'courante' && ouverte && session.peut('caisse.cloturer') ? (
              <Bouton variante="principal" icone="verrou" onClick={() => setDialogue('cloturer')}>
                Clôturer la caisse
              </Bouton>
            ) : null}
            {onglet === 'courante' && !ouverte && session.peut('caisse.ouvrir') ? (
              <Bouton variante="principal" icone="caisse" onClick={() => setDialogue('ouvrir')}>
                Ouvrir la caisse
              </Bouton>
            ) : null}
          </>
        }
      />

      {onglet === 'historique' ? (
        <HistoriqueCaisse />
      ) : !ouverte ? (
        <Panneau>
          <EtatVide icone="caisse" titre="La caisse est fermée">
            Ouvrez la caisse en indiquant le fond de départ. Chaque vente sera alors rattachée à
            cette session, et la clôture comparera le montant théorique au comptage réel.
          </EtatVide>
        </Panneau>
      ) : (
        <>
          <div className="indicateurs">
            <Indicateur libelle="Fond de caisse initial" valeur={montant(c.fondInitial)} />
            <Indicateur
              libelle="Encaissé en espèces"
              valeur={montant(c.encaisseEspeces)}
            />
            <Indicateur
              libelle="Sorties et dépenses"
              valeur={montant(c.sorties + c.depenses)}
            />
            <Indicateur
              libelle="Théorique en caisse"
              valeur={montant(c.theoriqueEspeces)}
            />
          </div>

          <div className="deux-colonnes">
            <MouvementsSession sessionId={c.session!.id} />

            <div className="pile">
              <Panneau titre="Récapitulatif" description="Total encaissé par mode de paiement.">
                <dl className="liste-definitions">
                  <dt>Espèces</dt>
                  <dd>{montant(c.encaisseEspeces)}</dd>
                  {c.autresEncaissements.map((a) => (
                    <Fragment key={a.mode}>
                      <dt>{modePaiement(a.mode)}</dt>
                      <dd>{montant(a.montant)}</dd>
                    </Fragment>
                  ))}
                  <dt style={{ fontWeight: 600, color: 'var(--texte)' }}>Total des ventes</dt>
                  <dd style={{ fontWeight: 700 }}>{montant(c.totalVentes)}</dd>
                </dl>
              </Panneau>

              <Panneau titre="Rappel">
                <p style={{ fontSize: 12.5, color: 'var(--texte-attenue)' }}>
                  Seuls les règlements en espèces circulent physiquement dans le tiroir. Les
                  encaissements par Mobile Money ou carte sont suivis séparément et n’entrent pas
                  dans le comptage de clôture.
                </p>
              </Panneau>
            </div>
          </div>
        </>
      )}

      {dialogue === 'ouvrir' ? (
        <Ouverture onFermer={() => setDialogue(null)} onOuverte={() => apres('Caisse ouverte')} />
      ) : null}
      {dialogue === 'cloturer' && c.session ? (
        <Cloture
          theorique={c.theoriqueEspeces}
          onFermer={() => setDialogue(null)}
          onCloturee={() => apres('Caisse clôturée')}
        />
      ) : null}
      {dialogue === 'mouvement' ? (
        <MouvementManuel
          onFermer={() => setDialogue(null)}
          onEnregistre={() => apres('Mouvement enregistré')}
        />
      ) : null}
    </>
  )
}

function MouvementsSession({ sessionId }: { sessionId: number }) {
  const session = useSession()
  const mouvements = useRequete<
    {
      id: number
      at: string
      type: string
      montant: number
      mode: string
      motif: string | null
      reference: string | null
      utilisateur: string | null
    }[]
  >('caisse.mouvementsSession', { sessionId }, session.peut('caisse.ecarts'))

  if (!session.peut('caisse.ecarts')) {
    return (
      <Panneau titre="Mouvements de la session">
        <EtatVide icone="verrou" titre="Accès restreint">
          Le détail des mouvements de caisse est réservé aux responsables.
        </EtatVide>
      </Panneau>
    )
  }

  return (
    <Tableau
      colonnes={[
        {
          cle: 'at',
          entete: 'Heure',
          largeur: '80px',
          rendu: (m) => heure(m.at),
          triSur: (m) => m.at
        },
        {
          cle: 'type',
          entete: 'Opération',
          rendu: (m) => (
            <CellulePrincipale
              titre={LIBELLES_MOUVEMENT[m.type] ?? m.type}
              sous={m.reference ?? m.motif ?? undefined}
            />
          )
        },
        { cle: 'mode', entete: 'Mode', rendu: (m) => modePaiement(m.mode), largeur: '120px' },
        {
          cle: 'montant',
          entete: 'Montant',
          nombre: true,
          rendu: (m) => (
            <strong style={{ color: m.montant < 0 ? 'var(--danger)' : 'var(--succes)' }}>
              {m.montant > 0 ? '+' : ''}
              {montant(m.montant)}
            </strong>
          ),
          triSur: (m) => m.montant
        },
        { cle: 'utilisateur', entete: 'Par', rendu: (m) => m.utilisateur ?? '—', largeur: '140px' }
      ]}
      lignes={mouvements.donnees}
      cle={(m) => m.id}
      chargement={mouvements.chargement}
      erreur={mouvements.erreur}
      onReessayer={mouvements.recharger}
      parPage={20}
      resume={(n) => `${n} mouvement${n > 1 ? 's' : ''}`}
      vide={
        <EtatVide icone="caisse" titre="Aucun mouvement">
          Les encaissements apparaîtront ici au fil des ventes.
        </EtatVide>
      }
    />
  )
}

const LIBELLES_MOUVEMENT: Record<string, string> = {
  fond_initial: 'Fond de caisse',
  vente: 'Encaissement de vente',
  remboursement: 'Remboursement',
  entree: 'Entrée de caisse',
  sortie: 'Sortie de caisse',
  depense: 'Dépense',
  correction: 'Correction'
}

function Ouverture({ onFermer, onOuverte }: { onFermer: () => void; onOuverte: () => void }) {
  const [fond, setFond] = useState(0)
  const action = useAction()

  async function ouvrir(): Promise<void> {
    const r = await action.executer('caisse.ouvrir', { fondInitial: fond })
    if (r !== null) onOuverte()
  }

  return (
    <Modale
      titre="Ouvrir la caisse"
      description="Comptez le tiroir avant de commencer la journée."
      onFermer={onFermer}
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="principal" enCours={action.enCours} onClick={ouvrir}>
            Ouvrir la caisse
          </Bouton>
        </>
      }
    >
      <div className="panneau-corps pile">
        {action.erreur ? <Bandeau ton="danger">{action.erreur.message}</Bandeau> : null}
        <ChampMontant
          libelle="Fond de caisse initial"
          valeur={fond}
          onChangeValeur={setFond}
          aide="Montant en espèces présent dans le tiroir à l’ouverture. Saisissez zéro si le tiroir est vide."
        />
      </div>
    </Modale>
  )
}

function Cloture({
  theorique,
  onFermer,
  onCloturee
}: {
  theorique: number
  onFermer: () => void
  onCloturee: () => void
}) {
  const [compte, setCompte] = useState(theorique)
  const [justification, setJustification] = useState('')
  const action = useAction()

  const ecart = compte - theorique

  async function cloturer(): Promise<void> {
    const r = await action.executer('caisse.cloturer', {
      totalCompte: compte,
      justification: justification.trim() || null
    })
    if (r !== null) onCloturee()
  }

  return (
    <Modale
      titre="Clôturer la caisse"
      description="Comptez le tiroir et saisissez le montant réel."
      onFermer={onFermer}
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="principal" enCours={action.enCours} onClick={cloturer}>
            Confirmer la clôture
          </Bouton>
        </>
      }
    >
      <div className="panneau-corps pile">
        {action.erreur ? <Bandeau ton="danger">{action.erreur.message}</Bandeau> : null}

        <dl className="liste-definitions">
          <dt>Montant théorique en espèces</dt>
          <dd style={{ fontWeight: 600 }}>{montant(theorique)}</dd>
        </dl>

        <ChampMontant
          libelle="Montant réellement compté"
          obligatoire
          valeur={compte}
          onChangeValeur={setCompte}
        />

        {ecart !== 0 ? (
          <Bandeau
            ton={Math.abs(ecart) > 0 ? 'attention' : 'info'}
            titre={`Écart de ${ecart > 0 ? '+' : ''}${montant(ecart)}`}
          >
            {ecart > 0
              ? 'Le tiroir contient plus que prévu. Vérifiez qu’aucune vente n’a été oubliée.'
              : 'Le tiroir contient moins que prévu. Une justification est requise.'}
          </Bandeau>
        ) : (
          <Bandeau ton="succes" titre="Aucun écart">
            Le comptage correspond exactement au théorique.
          </Bandeau>
        )}

        {ecart !== 0 ? (
          <ZoneTexte
            libelle="Justification de l’écart"
            obligatoire
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Erreur de rendu de monnaie, avance non enregistrée…"
          />
        ) : null}
      </div>
    </Modale>
  )
}

function MouvementManuel({ onFermer, onEnregistre }: { onFermer: () => void; onEnregistre: () => void }) {
  const [type, setType] = useState<'entree' | 'sortie'>('sortie')
  const [somme, setSomme] = useState(0)
  const [motif, setMotif] = useState('')
  const action = useAction()

  async function enregistrer(): Promise<void> {
    const r = await action.executer('caisse.mouvement', { type, montant: somme, motif: motif.trim() })
    if (r !== null) onEnregistre()
  }

  return (
    <Modale
      titre="Mouvement de caisse"
      description="Entrée ou sortie d’espèces hors vente."
      onFermer={onFermer}
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton
            variante="principal"
            disabled={somme <= 0 || motif.trim().length < 3}
            enCours={action.enCours}
            onClick={enregistrer}
          >
            Enregistrer
          </Bouton>
        </>
      }
    >
      <div className="panneau-corps pile">
        {action.erreur ? <Bandeau ton="danger">{action.erreur.message}</Bandeau> : null}
        <Liste
          libelle="Nature du mouvement"
          options={[
            { valeur: 'sortie', libelle: 'Sortie — retrait d’espèces' },
            { valeur: 'entree', libelle: 'Entrée — apport d’espèces' }
          ]}
          value={type}
          onChange={(e) => setType(e.target.value as 'entree' | 'sortie')}
        />
        <ChampMontant libelle="Montant" obligatoire valeur={somme} onChangeValeur={setSomme} />
        <ZoneTexte
          libelle="Motif"
          obligatoire
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          placeholder="Remise en banque, appoint de monnaie, avance…"
        />
      </div>
    </Modale>
  )
}

function HistoriqueCaisse() {
  const sessions = useRequete<CaisseSession[]>('caisse.historique')

  return (
    <Tableau
      colonnes={[
        {
          cle: 'reference',
          entete: 'Session',
          largeur: '150px',
          rendu: (s) => <CellulePrincipale titre={s.reference} sous={dateCourte(s.ouverte_at)} />,
          triSur: (s) => s.ouverte_at
        },
        { cle: 'utilisateur', entete: 'Responsable', rendu: (s) => s.utilisateur ?? '—' },
        {
          cle: 'horaires',
          entete: 'Horaires',
          rendu: (s) => `${heure(s.ouverte_at)} — ${s.fermee_at ? heure(s.fermee_at) : 'en cours'}`
        },
        { cle: 'fond', entete: 'Fond initial', nombre: true, rendu: (s) => montant(s.fond_initial) },
        {
          cle: 'theorique',
          entete: 'Théorique',
          nombre: true,
          rendu: (s) => montant(s.total_theorique)
        },
        { cle: 'compte', entete: 'Compté', nombre: true, rendu: (s) => montant(s.total_compte) },
        {
          cle: 'ecart',
          entete: 'Écart',
          nombre: true,
          rendu: (s) =>
            s.ecart === null ? (
              '—'
            ) : s.ecart === 0 ? (
              <Etiquette ton="succes">Exact</Etiquette>
            ) : (
              <Etiquette ton={Math.abs(s.ecart) > 0 ? 'attention' : 'succes'}>
                {s.ecart > 0 ? '+' : ''}
                {montant(s.ecart)}
              </Etiquette>
            ),
          triSur: (s) => s.ecart ?? 0
        },
        {
          cle: 'statut',
          entete: 'Statut',
          largeur: '110px',
          rendu: (s) =>
            s.statut === 'ouverte' ? (
              <Etiquette ton="info">Ouverte</Etiquette>
            ) : (
              <Etiquette ton="neutre">Clôturée</Etiquette>
            )
        }
      ]}
      lignes={sessions.donnees}
      cle={(s) => s.id}
      chargement={sessions.chargement}
      erreur={sessions.erreur}
      onReessayer={sessions.recharger}
      parPage={20}
      resume={(n) => `${n} session${n > 1 ? 's' : ''}`}
      vide={
        <EtatVide icone="caisse" titre="Aucune session de caisse">
          L’historique se constituera à mesure que vous ouvrirez et clôturerez la caisse.
        </EtatVide>
      }
    />
  )
}
