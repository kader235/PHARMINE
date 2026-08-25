import { useCallback, useEffect, useState } from 'react'
import type { ApercuCompte, Client, LigneReleve } from '@shared/types'
import { useAction, useRequete } from '../lib/hooks'
import { useSession } from '../app/Session'
import { useFonctions } from '../app/fonctions'
import type { Destination } from '../app/navigation'
import { useNotifications } from '../ui/Notifications'
import { useImpression } from '../ui/Impression'
import { ReleveDeCompte } from '../ui/Documents'
import {
  Bandeau,
  Bouton,
  Champ,
  ChampMontant,
  Chargement,
  EntetePage,
  Etiquette,
  EtatVide,
  Indicateur,
  Liste,
  Modale,
  Segments,
  ZoneTexte
} from '../ui/Composants'
import Tableau, { CellulePrincipale, RechercheTableau } from '../ui/Tableau'
import { dateCourte, depuis, montant, nombre } from '../lib/format'

export default function Clients({ destination }: { destination: Destination }) {
  const session = useSession()
  const notifications = useNotifications()
  const [recherche, setRecherche] = useState('')
  const [filtre, setFiltre] = useState<'tous' | 'debiteurs'>('tous')
  const [edition, setEdition] = useState<{ client: Client | null } | null>(null)
  const [detail, setDetail] = useState<number | null>(null)

  useEffect(() => {
    if (destination.cible?.type === 'client') setDetail(destination.cible.id)
  }, [destination])

  const liste = useRequete<Client[]>('clients.lister', { recherche: recherche.trim() || undefined })

  const tous = liste.donnees ?? []
  const affiches = filtre === 'debiteurs' ? tous.filter((c) => (c.solde_du ?? 0) > 0) : tous
  const creances = tous.reduce((s, c) => s + Math.max(0, c.solde_du ?? 0), 0)
  const debiteurs = tous.filter((c) => (c.solde_du ?? 0) > 0).length

  useFonctions('clients', [
    {
      touche: 'F2',
      libelle: 'Nouveau client',
      action: () => setEdition({ client: null }),
      disponible: session.peut('clients.gerer'),
      saillante: true
    },
    { touche: 'F5', libelle: 'Actualiser', action: () => liste.recharger() },
    {
      touche: 'F7',
      libelle: 'Voir les débiteurs',
      action: () => setFiltre((f) => (f === 'debiteurs' ? 'tous' : 'debiteurs')),
      disponible: debiteurs > 0
    }
  ])

  return (
    <>
      <EntetePage
        titre="Clients"
        actions={
          session.peut('clients.gerer') ? (
            <Bouton variante="principal" icone="plus" onClick={() => setEdition({ client: null })}>
              Ajouter un client
            </Bouton>
          ) : null
        }
      />

      <div className="indicateurs">
        <Indicateur
          libelle="Comptes clients"
          valeur={nombre(tous.length)}
        />
        <Indicateur
          libelle="Créances en cours"
          valeur={montant(creances)}
          ton={creances > 0 ? 'danger' : undefined}
        />
        <Indicateur
          libelle="Clients débiteurs"
          valeur={nombre(debiteurs)}
        />
      </div>

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
              c.plafond_credit > 0 ? (
                montant(c.plafond_credit)
              ) : (
                <span style={{ color: 'var(--texte-faible)' }}>Aucun</span>
              )
          },
          {
            cle: 'solde',
            entete: 'Solde dû',
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
        lignes={affiches}
        cle={(c) => c.id}
        chargement={liste.chargement}
        erreur={liste.erreur}
        onReessayer={liste.recharger}
        onLigneClic={(c) => setDetail(c.id)}
        parPage={25}
        filtreActif={recherche.trim().length > 0 || filtre !== 'tous'}
        resume={(n) => `${n} client${n > 1 ? 's' : ''}`}
        outils={
          <>
            <RechercheTableau
              valeur={recherche}
              onChange={setRecherche}
              placeholder="Nom, téléphone ou code…"
            />
            <Segments
              valeur={filtre}
              options={[
                { valeur: 'tous', libelle: 'Tous' },
                { valeur: 'debiteurs', libelle: `Débiteurs${debiteurs ? ` (${debiteurs})` : ''}` }
              ]}
              onChange={setFiltre}
            />
          </>
        }
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
            Le client reste facultatif au comptoir. Lui ouvrir un compte permet de suivre son
            historique et de lui accorder du crédit dans une limite que vous fixez.
          </EtatVide>
        }
        videApresFiltre={
          <EtatVide icone="coche" titre="Aucun client débiteur">
            Tous les comptes sont à jour.
          </EtatVide>
        }
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
          onChange={() => liste.recharger()}
        />
      ) : null}
    </>
  )
}

// ===========================================================================
// Formulaire
// ===========================================================================

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
          aide="Au-delà, une vente à crédit sera refusée au comptoir. Zéro : aucun plafond fixé."
        />
        <ZoneTexte libelle="Notes" value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
      </div>
    </Modale>
  )
}

// ===========================================================================
// Fiche client : compte, relevé, règlements
// ===========================================================================

function FicheClient({
  id,
  onFermer,
  onModifier,
  onChange
}: {
  id: number
  onFermer: () => void
  onModifier: (c: Client) => void
  onChange: () => void
}) {
  const session = useSession()
  const notifications = useNotifications()
  const { imprimer } = useImpression()
  const action = useAction()

  const [onglet, setOnglet] = useState<'compte' | 'releve' | 'coordonnees'>('compte')
  const [reglement, setReglement] = useState(false)

  const fiche = useRequete<
    Client & { ventes: { id: number; reference: string; at: string; total: number; reste_a_payer: number }[] }
  >('clients.detail', { id })
  const compte = useRequete<ApercuCompte>('clients.apercuCompte', { id })
  const releve = useRequete<LigneReleve[]>('clients.releve', { id })

  const imprimerReleve = useCallback(() => {
    if (!compte.donnees || !releve.donnees) return
    imprimer(
      <ReleveDeCompte
        compte={compte.donnees}
        lignes={releve.donnees}
        pharmacie={session.pharmacie}
      />,
      'a4'
    )
  }, [compte.donnees, releve.donnees, imprimer, session.pharmacie])

  function rafraichir(): void {
    fiche.recharger()
    compte.recharger()
    releve.recharger()
    onChange()
  }

  if (!fiche.donnees || !compte.donnees) {
    return (
      <Modale titre="Compte client" onFermer={onFermer}>
        <div className="panneau-corps">
          {fiche.erreur ? <Bandeau ton="danger">{fiche.erreur.message}</Bandeau> : <Chargement />}
        </div>
      </Modale>
    )
  }

  const c = fiche.donnees
  const compteur = compte.donnees
  const solde = compteur.encours

  if (reglement) {
    return (
      <ReglementCreance
        compte={compteur}
        onFermer={() => setReglement(false)}
        onRegle={() => {
          setReglement(false)
          rafraichir()
          notifications.succes('Règlement encaissé')
        }}
      />
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
            <Bouton className="a-gauche" variante="principal" icone="caisse" onClick={() => setReglement(true)}>
              Encaisser {montant(solde)}
            </Bouton>
          ) : null}
          <Bouton icone="imprimer" onClick={imprimerReleve}>
            Imprimer le relevé
          </Bouton>
          {session.peut('clients.gerer') ? (
            <Bouton icone="crayon" onClick={() => onModifier(c)}>
              Modifier
            </Bouton>
          ) : null}
          <Bouton onClick={onFermer}>Fermer</Bouton>
        </>
      }
    >
      <div className="tableau-outils">
        <Segments
          valeur={onglet}
          options={[
            { valeur: 'compte', libelle: 'Compte' },
            { valeur: 'releve', libelle: 'Relevé' },
            { valeur: 'coordonnees', libelle: 'Coordonnées' }
          ]}
          onChange={setOnglet}
        />
        <div style={{ marginLeft: 'auto' }}>
          {solde > 0 ? (
            <Etiquette ton="attention">{montant(solde)} restant dû</Etiquette>
          ) : (
            <Etiquette ton="succes">Compte à jour</Etiquette>
          )}
        </div>
      </div>

      {onglet === 'compte' ? (
        <div className="panneau-corps">
          <div className="indicateurs" style={{ marginBottom: 14 }}>
            <Indicateur
              libelle="Solde dû"
              valeur={montant(solde)}
              ton={solde > 0 ? 'danger' : undefined}
            />
            <Indicateur
              libelle="Crédit disponible"
              valeur={compteur.disponible === null ? 'Non plafonné' : montant(compteur.disponible)}
            />
            <Indicateur
              libelle="Total acheté"
              valeur={montant(compteur.totalAchats)}
            />
            <Indicateur
              libelle="Dernier règlement"
              valeur={compteur.dernierReglement ? dateCourte(compteur.dernierReglement) : 'Aucun'}
            />
          </div>

          <div className="formulaire-titre">Ventes du client</div>
          {c.ventes.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--texte-faible)' }}>
              Aucune vente enregistrée pour ce client.
            </p>
          ) : (
            <div className="tableau-defilement" style={{ maxHeight: 260, overflowY: 'auto' }}>
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
      ) : null}

      {onglet === 'releve' ? (
        releve.chargement && !releve.donnees ? (
          <Chargement />
        ) : (releve.donnees?.length ?? 0) === 0 ? (
          <EtatVide icone="journal" titre="Aucun mouvement sur ce compte">
            Le relevé se remplira dès la première vente à crédit ou le premier règlement.
          </EtatVide>
        ) : (
          <div className="tableau-defilement" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="tableau">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Référence</th>
                  <th>Libellé</th>
                  <th className="cellule-nombre">Débit</th>
                  <th className="cellule-nombre">Crédit</th>
                  <th className="cellule-nombre">Solde</th>
                </tr>
              </thead>
              <tbody>
                {releve.donnees!.map((l, i) => (
                  <tr key={i}>
                    <td>{dateCourte(l.at)}</td>
                    <td>{l.reference}</td>
                    <td>
                      {l.libelle}
                      {l.utilisateur ? (
                        <span style={{ color: 'var(--texte-faible)' }}> · {l.utilisateur}</span>
                      ) : null}
                    </td>
                    <td className="cellule-nombre">{l.debit > 0 ? montant(l.debit) : '—'}</td>
                    <td className="cellule-nombre">
                      {l.credit > 0 ? (
                        <span style={{ color: 'var(--succes)' }}>{montant(l.credit)}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="cellule-nombre">
                      <strong>{montant(l.solde)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {onglet === 'coordonnees' ? (
        <div className="panneau-corps">
          <dl className="liste-definitions">
            <dt>Code client</dt>
            <dd>{c.code}</dd>
            <dt>Téléphone</dt>
            <dd>{c.telephone ?? '—'}</dd>
            <dt>Courriel</dt>
            <dd>{c.email ?? '—'}</dd>
            <dt>Adresse</dt>
            <dd>{c.adresse ?? '—'}</dd>
            <dt>Date de naissance</dt>
            <dd>{dateCourte(c.date_naissance)}</dd>
            <dt>Plafond de crédit</dt>
            <dd>{c.plafond_credit > 0 ? montant(c.plafond_credit) : 'Aucun'}</dd>
          </dl>
          {c.notes ? (
            <div style={{ marginTop: 16 }}>
              <div className="formulaire-titre">Notes</div>
              <p style={{ fontSize: 12.5, color: 'var(--texte-attenue)' }}>{c.notes}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {action.erreur ? (
        <div style={{ padding: '0 14px 14px' }}>
          <Bandeau ton="danger">{action.erreur.message}</Bandeau>
        </div>
      ) : null}
    </Modale>
  )
}

// ===========================================================================
// Règlement d'une créance
// ===========================================================================

function ReglementCreance({
  compte,
  onFermer,
  onRegle
}: {
  compte: ApercuCompte
  onFermer: () => void
  onRegle: () => void
}) {
  const action = useAction()
  const [somme, setSomme] = useState(compte.encours)
  const [mode, setMode] = useState<'especes' | 'mobile_money' | 'carte' | 'virement' | 'cheque'>('especes')

  const restant = compte.encours - somme

  async function encaisser(): Promise<void> {
    const r = await action.executer('clients.reglement', {
      clientId: compte.clientId,
      montant: somme,
      mode,
      venteId: null
    })
    if (r !== null) onRegle()
  }

  return (
    <Modale
      titre="Encaisser une créance"
      description={`${compte.nom} — ${montant(compte.encours)} restant dû`}
      onFermer={onFermer}
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton
            variante="principal"
            disabled={somme <= 0 || somme > compte.encours}
            enCours={action.enCours}
            onClick={encaisser}
          >
            Encaisser {montant(somme)}
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
          erreur={somme > compte.encours ? `Le règlement dépasse la créance (${montant(compte.encours)}).` : undefined}
        />
        <div className="rangee">
          <Bouton compact onClick={() => setSomme(compte.encours)}>
            Solder la totalité
          </Bouton>
          {compte.encours >= 2 ? (
            <Bouton compact variante="discret" onClick={() => setSomme(Math.round(compte.encours / 2))}>
              La moitié
            </Bouton>
          ) : null}
        </div>
        <Liste
          libelle="Mode de règlement"
          options={[
            { valeur: 'especes', libelle: 'Espèces' },
            { valeur: 'mobile_money', libelle: 'Mobile Money' },
            { valeur: 'carte', libelle: 'Carte bancaire' },
            { valeur: 'virement', libelle: 'Virement' },
            { valeur: 'cheque', libelle: 'Chèque' }
          ]}
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
        />
        {somme > 0 && somme <= compte.encours ? (
          <Bandeau ton={restant === 0 ? 'succes' : 'info'}>
            {restant === 0
              ? 'Ce règlement solde entièrement le compte.'
              : `Il restera ${montant(restant)} après ce règlement.`}
          </Bandeau>
        ) : null}
      </div>
    </Modale>
  )
}
