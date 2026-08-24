import { useEffect, useState } from 'react'
import type { Client } from '@shared/types'
import { useAction, useRequete } from '../lib/hooks'
import { useSession } from '../app/Session'
import type { Destination } from '../app/navigation'
import { useNotifications } from '../ui/Notifications'
import {
  Bandeau,
  Bouton,
  Champ,
  ChampMontant,
  Chargement,
  EntetePage,
  Etiquette,
  EtatVide,
  Liste,
  Modale,
  ZoneTexte
} from '../ui/Composants'
import Tableau, { CellulePrincipale, RechercheTableau } from '../ui/Tableau'
import { dateCourte, depuis, montant } from '../lib/format'

export default function Clients({ destination }: { destination: Destination }) {
  const session = useSession()
  const notifications = useNotifications()
  const [recherche, setRecherche] = useState('')
  const [edition, setEdition] = useState<{ client: Client | null } | null>(null)
  const [detail, setDetail] = useState<number | null>(null)

  useEffect(() => {
    if (destination.cible?.type === 'client') setDetail(destination.cible.id)
  }, [destination])

  const liste = useRequete<Client[]>('clients.lister', { recherche: recherche.trim() || undefined })
  const creances = (liste.donnees ?? []).reduce((s, c) => s + Math.max(0, c.solde_du ?? 0), 0)

  return (
    <>
      <EntetePage
        titre="Clients"
        description="Historique d’achat, créances et plafonds de crédit."
        actions={
          session.peut('clients.gerer') ? (
            <Bouton variante="principal" icone="plus" onClick={() => setEdition({ client: null })}>
              Ajouter un client
            </Bouton>
          ) : null
        }
      />

      <Tableau
        colonnes={[
          {
            cle: 'nom',
            entete: 'Client',
            triSur: (c: Client) => c.nom,
            rendu: (c: Client) => <CellulePrincipale titre={c.nom} sous={c.code} />
          },
          { cle: 'telephone', entete: 'Téléphone', rendu: (c: Client) => c.telephone ?? '—' },
          {
            cle: 'visite',
            entete: 'Dernière visite',
            rendu: (c: Client) => (c.derniere_visite ? depuis(c.derniere_visite) : '—'),
            triSur: (c: Client) => c.derniere_visite ?? ''
          },
          {
            cle: 'total',
            entete: 'Total acheté',
            nombre: true,
            rendu: (c: Client) => montant(c.total_achats ?? 0),
            triSur: (c: Client) => c.total_achats ?? 0
          },
          {
            cle: 'plafond',
            entete: 'Plafond',
            nombre: true,
            rendu: (c: Client) =>
              c.plafond_credit > 0 ? montant(c.plafond_credit) : <span style={{ color: 'var(--texte-faible)' }}>Aucun</span>
          },
          {
            cle: 'solde',
            entete: 'Créance',
            nombre: true,
            rendu: (c: Client) =>
              (c.solde_du ?? 0) > 0 ? (
                <Etiquette ton="attention">{montant(c.solde_du)}</Etiquette>
              ) : (
                <span style={{ color: 'var(--texte-faible)' }}>À jour</span>
              ),
            triSur: (c: Client) => c.solde_du ?? 0
          }
        ]}
        lignes={liste.donnees}
        cle={(c) => c.id}
        chargement={liste.chargement}
        erreur={liste.erreur}
        onReessayer={liste.recharger}
        onLigneClic={(c) => setDetail(c.id)}
        parPage={25}
        filtreActif={recherche.trim().length > 0}
        resume={(n) => `${n} client${n > 1 ? 's' : ''} · ${montant(creances)} de créances`}
        outils={<RechercheTableau valeur={recherche} onChange={setRecherche} placeholder="Nom, téléphone ou code…" />}
        vide={
          <EtatVide
            icone="client"
            titre="Aucun client enregistré"
            action={
              session.peut('clients.gerer') ? (
                <Bouton variante="principal" icone="plus" onClick={() => setEdition({ client: null })}>
                  Ajouter un client
                </Bouton>
              ) : undefined
            }
          >
            Le client reste facultatif au comptoir. L’enregistrer permet de suivre son historique et
            de lui accorder du crédit.
          </EtatVide>
        }
        videApresFiltre={<EtatVide icone="recherche" titre="Aucun client ne correspond" />}
      />

      {edition ? (
        <FormulaireClient
          client={edition.client}
          onFermer={() => setEdition(null)}
          onEnregistre={(nouveau) => {
            setEdition(null)
            liste.recharger()
            notifications.succes(nouveau ? 'Client créé' : 'Client modifié')
          }}
        />
      ) : null}

      {detail !== null ? (
        <FicheClient
          id={detail}
          onFermer={() => setDetail(null)}
          onModifier={(c) => {
            setDetail(null)
            setEdition({ client: c })
          }}
          onRegle={() => {
            liste.recharger()
            notifications.succes('Règlement enregistré')
          }}
        />
      ) : null}
    </>
  )
}

function FormulaireClient({
  client,
  onFermer,
  onEnregistre
}: {
  client: Client | null
  onFermer: () => void
  onEnregistre: (nouveau: boolean) => void
}) {
  const action = useAction()
  const [d, setD] = useState({
    nom: client?.nom ?? '',
    telephone: client?.telephone ?? '',
    email: client?.email ?? '',
    adresse: client?.adresse ?? '',
    dateNaissance: client?.date_naissance ?? '',
    plafondCredit: client?.plafond_credit ?? 0,
    notes: client?.notes ?? ''
  })

  async function enregistrer(): Promise<void> {
    const r = await action.executer('clients.enregistrer', {
      id: client?.id ?? null,
      donnees: {
        ...d,
        telephone: d.telephone.trim() || null,
        email: d.email.trim() || null,
        adresse: d.adresse.trim() || null,
        dateNaissance: d.dateNaissance || null,
        notes: d.notes.trim() || null
      }
    })
    if (r !== null) onEnregistre(!client)
  }

  return (
    <Modale
      titre={client ? `Modifier ${client.nom}` : 'Nouveau client'}
      onFermer={onFermer}
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton
            variante="principal"
            disabled={d.nom.trim().length < 2}
            enCours={action.enCours}
            onClick={enregistrer}
          >
            {client ? 'Enregistrer' : 'Créer le client'}
          </Bouton>
        </>
      }
    >
      <div className="panneau-corps pile">
        {action.erreur ? <Bandeau ton="danger">{action.erreur.message}</Bandeau> : null}
        <Champ libelle="Nom" obligatoire value={d.nom} onChange={(e) => setD({ ...d, nom: e.target.value })} />
        <div className="grille deux">
          <Champ libelle="Téléphone" value={d.telephone} onChange={(e) => setD({ ...d, telephone: e.target.value })} />
          <Champ
            libelle="Adresse électronique"
            type="email"
            value={d.email}
            onChange={(e) => setD({ ...d, email: e.target.value })}
          />
          <Champ libelle="Adresse" value={d.adresse} onChange={(e) => setD({ ...d, adresse: e.target.value })} />
          <Champ
            libelle="Date de naissance"
            type="date"
            value={d.dateNaissance}
            onChange={(e) => setD({ ...d, dateNaissance: e.target.value })}
          />
        </div>
        <ChampMontant
          libelle="Plafond de crédit"
          valeur={d.plafondCredit}
          onChangeValeur={(v) => setD({ ...d, plafondCredit: v })}
          aide="Au-delà, une vente à crédit sera refusée. Laissez à zéro pour ne pas autoriser de crédit plafonné."
        />
        <ZoneTexte libelle="Notes" value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
      </div>
    </Modale>
  )
}

function FicheClient({
  id,
  onFermer,
  onModifier,
  onRegle
}: {
  id: number
  onFermer: () => void
  onModifier: (c: Client) => void
  onRegle: () => void
}) {
  const session = useSession()
  const action = useAction()
  const [reglement, setReglement] = useState(false)
  const [somme, setSomme] = useState(0)
  const [mode, setMode] = useState<'especes' | 'mobile_money' | 'carte' | 'virement' | 'cheque'>('especes')

  const fiche = useRequete<
    Client & { ventes: { id: number; reference: string; at: string; total: number; reste_a_payer: number }[] }
  >('clients.detail', { id })

  if (!fiche.donnees) {
    return (
      <Modale titre="Fiche client" onFermer={onFermer}>
        <div className="panneau-corps">
          {fiche.erreur ? <Bandeau ton="danger">{fiche.erreur.message}</Bandeau> : <Chargement />}
        </div>
      </Modale>
    )
  }

  const c = fiche.donnees
  const solde = Math.max(0, c.solde_du ?? 0)

  async function encaisser(): Promise<void> {
    const r = await action.executer('clients.reglement', {
      clientId: id,
      montant: somme,
      mode,
      venteId: null
    })
    if (r !== null) {
      setReglement(false)
      fiche.recharger()
      onRegle()
    }
  }

  if (reglement) {
    return (
      <Modale
        titre="Encaisser une créance"
        description={`${c.nom} — ${montant(solde)} restant dû`}
        onFermer={() => setReglement(false)}
        pied={
          <>
            <Bouton onClick={() => setReglement(false)}>Annuler</Bouton>
            <Bouton
              variante="principal"
              disabled={somme <= 0 || somme > solde}
              enCours={action.enCours}
              onClick={encaisser}
            >
              Encaisser
            </Bouton>
          </>
        }
      >
        <div className="panneau-corps pile">
          {action.erreur ? <Bandeau ton="danger">{action.erreur.message}</Bandeau> : null}
          <ChampMontant
            libelle="Montant reçu"
            obligatoire
            valeur={somme}
            onChangeValeur={setSomme}
            erreur={somme > solde ? `Le règlement dépasse la créance (${montant(solde)}).` : undefined}
          />
          <Bouton compact onClick={() => setSomme(solde)}>
            Solder la totalité
          </Bouton>
          <Liste
            libelle="Mode de règlement"
            options={[
              { valeur: 'especes', libelle: 'Espèces' },
              { valeur: 'mobile_money', libelle: 'Mobile Money' },
              { valeur: 'carte', libelle: 'Carte' },
              { valeur: 'virement', libelle: 'Virement' },
              { valeur: 'cheque', libelle: 'Chèque' }
            ]}
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          />
        </div>
      </Modale>
    )
  }

  return (
    <Modale
      titre={c.nom}
      description={[c.code, c.telephone].filter(Boolean).join(' · ')}
      large
      onFermer={onFermer}
      pied={
        <>
          {solde > 0 && session.peut('clients.reglement') ? (
            <Bouton
              className="a-gauche"
              variante="principal"
              icone="caisse"
              onClick={() => {
                setSomme(solde)
                setReglement(true)
              }}
            >
              Encaisser {montant(solde)}
            </Bouton>
          ) : null}
          {session.peut('clients.gerer') ? (
            <Bouton icone="crayon" onClick={() => onModifier(c)}>
              Modifier
            </Bouton>
          ) : null}
          <Bouton onClick={onFermer}>Fermer</Bouton>
        </>
      }
    >
      <div className="panneau-corps">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <div className="formulaire-titre">Coordonnées</div>
            <dl className="liste-definitions">
              <dt>Téléphone</dt>
              <dd>{c.telephone ?? '—'}</dd>
              <dt>Courriel</dt>
              <dd>{c.email ?? '—'}</dd>
              <dt>Adresse</dt>
              <dd>{c.adresse ?? '—'}</dd>
              <dt>Date de naissance</dt>
              <dd>{dateCourte(c.date_naissance)}</dd>
            </dl>
          </div>
          <div>
            <div className="formulaire-titre">Compte</div>
            <dl className="liste-definitions">
              <dt>Total acheté</dt>
              <dd>{montant(c.total_achats ?? 0)}</dd>
              <dt>Plafond de crédit</dt>
              <dd>{c.plafond_credit > 0 ? montant(c.plafond_credit) : 'Aucun'}</dd>
              <dt>Créance en cours</dt>
              <dd style={{ fontWeight: 700, color: solde > 0 ? 'var(--attention)' : 'var(--succes)' }}>
                {montant(solde)}
              </dd>
              <dt>Dernière visite</dt>
              <dd>{c.derniere_visite ? depuis(c.derniere_visite) : '—'}</dd>
            </dl>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div className="formulaire-titre">Historique d’achat</div>
          {c.ventes.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--texte-faible)' }}>
              Aucune vente enregistrée pour ce client.
            </p>
          ) : (
            <div className="tableau-defilement" style={{ maxHeight: 300, overflowY: 'auto' }}>
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Date</th>
                    <th className="cellule-nombre">Total</th>
                    <th className="cellule-nombre">Reste dû</th>
                  </tr>
                </thead>
                <tbody>
                  {c.ventes.map((v) => (
                    <tr key={v.id}>
                      <td>{v.reference}</td>
                      <td>{dateCourte(v.at)}</td>
                      <td className="cellule-nombre">{montant(v.total)}</td>
                      <td className="cellule-nombre">
                        {v.reste_a_payer > 0 ? (
                          <span style={{ color: 'var(--attention)' }}>{montant(v.reste_a_payer)}</span>
                        ) : (
                          <span style={{ color: 'var(--texte-faible)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {c.notes ? (
          <div style={{ marginTop: 16 }}>
            <div className="formulaire-titre">Notes</div>
            <p style={{ fontSize: 12.5, color: 'var(--texte-attenue)' }}>{c.notes}</p>
          </div>
        ) : null}
      </div>
    </Modale>
  )
}
