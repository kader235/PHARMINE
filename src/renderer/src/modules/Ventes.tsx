import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  Avertissement,
  Client,
  DemandeVente,
  ModePaiement,
  ProduitEtat,
  Vente,
  VenteDetail
} from '@shared/types'
import { useAction, useDifferee, useRequete } from '../lib/hooks'
import { useSession } from '../app/Session'
import { useNavigation, type Destination } from '../app/navigation'
import { useNotifications } from '../ui/Notifications'
import Icone from '../ui/Icone'
import {
  Bandeau,
  Bouton,
  BoutonIcone,
  Champ,
  ChampMontant,
  EntetePage,
  Etiquette,
  EtatVide,
  Modale,
  Segments,
  ZoneTexte
} from '../ui/Composants'
import Tableau, { CellulePrincipale, RechercheTableau } from '../ui/Tableau'
import { dateCourte, depuis, heure, modePaiement, montant, nombre } from '../lib/format'

interface LignePanier {
  produit: ProduitEtat
  quantite: number
  remise: number
}

const MODES: { valeur: ModePaiement; libelle: string }[] = [
  { valeur: 'especes', libelle: 'Espèces' },
  { valeur: 'mobile_money', libelle: 'Mobile Money' },
  { valeur: 'carte', libelle: 'Carte' },
  { valeur: 'virement', libelle: 'Virement' }
]

export default function Ventes({ destination }: { destination: Destination }) {
  const session = useSession()
  const [onglet, setOnglet] = useState<'comptoir' | 'historique'>(
    session.peut('ventes.creer') ? 'comptoir' : 'historique'
  )

  useEffect(() => {
    if (destination.cible?.type === 'vente') setOnglet('historique')
  }, [destination])

  const onglets = [
    ...(session.peut('ventes.creer') ? [{ valeur: 'comptoir' as const, libelle: 'Comptoir' }] : []),
    ...(session.peut('ventes.historique') ? [{ valeur: 'historique' as const, libelle: 'Historique' }] : [])
  ]

  return (
    <>
      <EntetePage
        titre={onglet === 'comptoir' ? 'Nouvelle vente' : 'Historique des ventes'}
        description={
          onglet === 'comptoir'
            ? 'Recherchez, ajoutez au panier, encaissez.'
            : 'Toutes les ventes enregistrées, avec leur détail par lot.'
        }
        actions={
          onglets.length > 1 ? <Segments valeur={onglet} options={onglets} onChange={setOnglet} /> : null
        }
      />
      {onglet === 'comptoir' ? <Comptoir /> : <Historique destination={destination} />}
    </>
  )
}

// ===========================================================================
// Comptoir
// ===========================================================================

function Comptoir() {
  const session = useSession()
  const naviguer = useNavigation()
  const notifications = useNotifications()
  const action = useAction()

  const [saisie, setSaisie] = useState('')
  const [panier, setPanier] = useState<LignePanier[]>([])
  const [clientId, setClientId] = useState<number | null>(null)
  const [mode, setMode] = useState<ModePaiement>('especes')
  const [recu, setRecu] = useState(0)
  const [recuModifie, setRecuModifie] = useState(false)
  const [note, setNote] = useState('')
  const [survol, setSurvol] = useState(0)
  const [choixClient, setChoixClient] = useState(false)
  const [ticket, setTicket] = useState<VenteDetail | null>(null)

  const champRecherche = useRef<HTMLInputElement>(null)
  const differee = useDifferee(saisie, 140)

  const caisse = useRequete<{ session: { reference: string } | null }>('caisse.etat')
  const clients = useRequete<Client[]>('clients.lister', {}, session.peut('clients.voir'))

  const resultats = useRequete<ProduitEtat[]>(
    'produits.rechercheRapide',
    { saisie: differee },
    differee.trim().length >= 2
  )

  const client = clients.donnees?.find((c) => c.id === clientId) ?? null

  const sousTotal = panier.reduce((s, l) => s + l.produit.prix_vente * l.quantite, 0)
  const remise = panier.reduce((s, l) => s + l.remise, 0)
  const total = sousTotal - remise

  const demande = useMemo<DemandeVente>(
    () => ({
      clientId,
      lignes: panier.map((l) => ({ produitId: l.produit.id, quantite: l.quantite, remise: l.remise })),
      paiements: recu > 0 ? [{ mode, montant: recu }] : [],
      note: note.trim() || undefined
    }),
    [panier, clientId, mode, recu, note]
  )

  const controle = useRequete<{
    avertissements: Avertissement[]
    total: number
    monnaieRendue: number
    resteAPayer: number
  }>('ventes.verifier', demande, panier.length > 0)

  const avertissements = controle.donnees?.avertissements ?? []
  const bloquants = avertissements.filter((a) => a.bloquant)
  const signalements = avertissements.filter((a) => !a.bloquant)
  const monnaie = Math.max(0, recu - total)
  const reste = Math.max(0, total - recu)

  const ajouter = useCallback((produit: ProduitEtat) => {
    if (produit.stock_disponible <= 0) return
    setPanier((precedent) => {
      const existante = precedent.find((l) => l.produit.id === produit.id)
      if (existante) {
        return precedent.map((l) =>
          l.produit.id === produit.id ? { ...l, quantite: l.quantite + 1 } : l
        )
      }
      return [...precedent, { produit, quantite: 1, remise: 0 }]
    })
    setSaisie('')
    champRecherche.current?.focus()
  }, [])

  function changerQuantite(produitId: number, quantite: number): void {
    setPanier((precedent) =>
      quantite <= 0
        ? precedent.filter((l) => l.produit.id !== produitId)
        : precedent.map((l) => (l.produit.id === produitId ? { ...l, quantite } : l))
    )
  }

  function viderPanier(): void {
    setPanier([])
    setRecu(0)
    setRecuModifie(false)
    setNote('')
    setClientId(null)
    setMode('especes')
  }

  function auClavier(e: React.KeyboardEvent): void {
    const liste = resultats.donnees ?? []
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSurvol((s) => Math.min(s + 1, liste.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSurvol((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter' && liste.length) {
      e.preventDefault()
      const choisi = liste[survol] ?? liste[0]
      if (choisi) ajouter(choisi)
    } else if (e.key === 'Escape') {
      setSaisie('')
    }
  }

  useEffect(() => setSurvol(0), [differee])

  // Le montant reçu suit le total tant que le caissier ne l'a pas corrigé :
  // le cas courant est le compte juste, et cela évite d'afficher une alerte
  // de crédit alors qu'aucun paiement n'a encore été saisi.
  useEffect(() => {
    if (!recuModifie) setRecu(total)
  }, [total, recuModifie])

  async function finaliser(): Promise<void> {
    const resultat = await action.executer<VenteDetail>('ventes.enregistrer', demande)
    if (resultat) {
      setTicket(resultat)
      viderPanier()
      caisse.recharger()
      notifications.succes('Vente enregistrée', `${resultat.reference} — ${montant(resultat.total)}`)
    }
  }

  const caisseFermee = caisse.donnees !== null && caisse.donnees.session === null

  return (
    <>
      {caisseFermee ? (
        <div style={{ marginBottom: 12 }}>
          <Bandeau
            ton="attention"
            titre="Aucune caisse ouverte"
            action={
              session.peut('caisse.ouvrir') ? (
                <Bouton compact onClick={() => naviguer({ module: 'caisse' })}>
                  Ouvrir la caisse
                </Bouton>
              ) : null
            }
          >
            Les ventes doivent être rattachées à une session de caisse. Ouvrez la caisse avant de
            commencer à encaisser.
          </Bandeau>
        </div>
      ) : null}

      <div className="vente">
        <div>
          <div className="vente-recherche">
            <Icone nom="recherche" taille={17} />
            <input
              ref={champRecherche}
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              onKeyDown={auClavier}
              placeholder="Nom, dosage, principe actif ou code-barres…"
              autoFocus
              aria-label="Rechercher un produit"
            />
            <span className="raccourci">Entrée pour ajouter</span>
          </div>

          <section className="panneau vente-resultats">
            {differee.trim().length < 2 ? (
              <EtatVide icone="code-barres" titre="Recherchez un produit">
                Saisissez au moins deux lettres, ou scannez un code-barres. Les flèches et la touche
                Entrée permettent d’ajouter au panier sans quitter le clavier.
              </EtatVide>
            ) : resultats.chargement && !resultats.donnees ? (
              <div className="chargement">
                <span className="rotateur" />
                Recherche…
              </div>
            ) : (resultats.donnees?.length ?? 0) === 0 ? (
              <EtatVide icone="recherche" titre={`Aucun produit pour « ${differee.trim()} »`}>
                Vérifiez l’orthographe, ou créez ce produit depuis le catalogue s’il est nouveau.
              </EtatVide>
            ) : (
              resultats.donnees!.map((produit, index) => {
                const rupture = produit.stock_disponible <= 0
                return (
                  <button
                    key={produit.id}
                    className={`produit-ligne${index === survol ? ' survol' : ''}`}
                    disabled={rupture}
                    onMouseEnter={() => setSurvol(index)}
                    onClick={() => ajouter(produit)}
                  >
                    <span className="nom">
                      <strong>
                        {produit.nom_commercial} {produit.dosage ?? ''}
                        {produit.ordonnance_requise ? (
                          <Etiquette ton="info" sansPoint>
                            Ordonnance
                          </Etiquette>
                        ) : null}
                      </strong>
                      <span>
                        {[produit.forme, produit.categorie, produit.emplacement].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <Etiquette ton={rupture ? 'danger' : produit.etat_stock === 'faible' ? 'attention' : 'succes'}>
                      {rupture ? 'Rupture' : `${nombre(produit.stock_disponible)} en stock`}
                    </Etiquette>
                    <span className="prix">{montant(produit.prix_vente)}</span>
                    {!rupture ? <Icone nom="plus" taille={15} /> : null}
                  </button>
                )
              })
            )}
          </section>
        </div>

        <aside className="panneau panier">
          <header className="panneau-entete">
            <div>
              <h2>Panier</h2>
              <p>
                {panier.reduce((s, l) => s + l.quantite, 0)} article
                {panier.reduce((s, l) => s + l.quantite, 0) > 1 ? 's' : ''}
              </p>
            </div>
            {panier.length ? (
              <Bouton compact variante="discret" onClick={viderPanier}>
                Vider
              </Bouton>
            ) : null}
          </header>

          <div className="panier-lignes">
            {panier.length === 0 ? (
              <EtatVide icone="vente" titre="Panier vide">
                Ajoutez un produit depuis la liste de gauche.
              </EtatVide>
            ) : (
              panier.map((ligne) => (
                <div className="panier-ligne" key={ligne.produit.id}>
                  <div className="designation">
                    <strong>
                      {ligne.produit.nom_commercial} {ligne.produit.dosage ?? ''}
                    </strong>
                    <span>
                      {montant(ligne.produit.prix_vente)} l’unité · {montant(ligne.produit.prix_vente * ligne.quantite)}
                    </span>
                  </div>
                  <div className="quantite">
                    <button onClick={() => changerQuantite(ligne.produit.id, ligne.quantite - 1)} aria-label="Retirer un">
                      <Icone nom="moins" taille={13} />
                    </button>
                    <input
                      type="number"
                      value={ligne.quantite}
                      min={1}
                      onChange={(e) => changerQuantite(ligne.produit.id, Number(e.target.value))}
                      aria-label={`Quantité de ${ligne.produit.nom_commercial}`}
                    />
                    <button
                      onClick={() => changerQuantite(ligne.produit.id, ligne.quantite + 1)}
                      disabled={ligne.quantite >= ligne.produit.stock_disponible}
                      aria-label="Ajouter un"
                    >
                      <Icone nom="plus" taille={13} />
                    </button>
                  </div>
                  <BoutonIcone
                    icone="croix"
                    titre="Retirer du panier"
                    onClick={() => changerQuantite(ligne.produit.id, 0)}
                  />
                </div>
              ))
            )}
          </div>

          {signalements.length > 0 ? (
            <div style={{ padding: '10px 12px', display: 'grid', gap: 6 }}>
              {signalements.map((a, i) => (
                <Bandeau key={i} ton="attention" titre={a.message}>
                  {a.detail}
                </Bandeau>
              ))}
            </div>
          ) : null}

          {bloquants.length > 0 ? (
            <div style={{ padding: '10px 12px', display: 'grid', gap: 6 }}>
              {bloquants.map((a, i) => (
                <Bandeau key={i} ton="danger" titre={a.message}>
                  {a.detail}
                </Bandeau>
              ))}
            </div>
          ) : null}

          <div className="panier-total">
            <span>Total à payer</span>
            <strong>{montant(total)}</strong>
          </div>

          <div className="panneau-corps" style={{ display: 'grid', gap: 10 }}>
            {session.peut('clients.voir') ? (
              <div className="rangee espace">
                <span style={{ color: 'var(--texte-attenue)', fontSize: 12 }}>
                  {client ? (
                    <>
                      Client : <strong style={{ color: 'var(--texte)' }}>{client.nom}</strong>
                    </>
                  ) : (
                    'Client de passage'
                  )}
                </span>
                <div className="rangee" style={{ gap: 4 }}>
                  {client ? (
                    <Bouton compact variante="discret" onClick={() => setClientId(null)}>
                      Retirer
                    </Bouton>
                  ) : null}
                  <Bouton compact variante="discret" icone="client" onClick={() => setChoixClient(true)}>
                    {client ? 'Changer' : 'Associer'}
                  </Bouton>
                </div>
              </div>
            ) : null}

            <div>
              <div style={{ color: 'var(--texte-attenue)', fontSize: 11, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 6 }}>
                Mode de paiement
              </div>
              <Segments valeur={mode} options={MODES} onChange={setMode} />
            </div>

            <ChampMontant
              libelle="Montant reçu"
              valeur={recu}
              onChangeValeur={(v) => {
                setRecuModifie(true)
                setRecu(v)
              }}
              aide={recuModifie ? undefined : 'Pré-rempli au total. Corrigez selon ce que remet le client.'}
            />

            <div className="rangee" style={{ gap: 6 }}>
              <Bouton
                compact
                onClick={() => {
                  setRecuModifie(true)
                  setRecu(total)
                }}
              >
                Compte juste
              </Bouton>
              {[1000, 2000, 5000, 10000].map((valeur) => (
                <Bouton
                  key={valeur}
                  compact
                  variante="discret"
                  onClick={() => {
                    setRecuModifie(true)
                    setRecu((r) => r + valeur)
                  }}
                >
                  +{montant(valeur, false)}
                </Bouton>
              ))}
            </div>

            {monnaie > 0 ? (
              <div className="ligne-resume">
                <span>Monnaie à rendre</span>
                <strong style={{ color: 'var(--succes)', fontSize: 15 }}>{montant(monnaie)}</strong>
              </div>
            ) : null}
            {reste > 0 && panier.length > 0 ? (
              <div className="ligne-resume">
                <span>Reste à payer (crédit)</span>
                <strong style={{ color: 'var(--attention)', fontSize: 15 }}>{montant(reste)}</strong>
              </div>
            ) : null}

            {action.erreur ? <Bandeau ton="danger">{action.erreur.message}</Bandeau> : null}

            <Bouton
              variante="principal"
              pleine
              icone="coche"
              disabled={panier.length === 0 || bloquants.length > 0}
              enCours={action.enCours}
              onClick={finaliser}
            >
              Finaliser la vente
            </Bouton>
          </div>
        </aside>
      </div>

      {choixClient ? (
        <ChoixClient
          clients={clients.donnees ?? []}
          onChoisir={(id) => {
            setClientId(id)
            setChoixClient(false)
          }}
          onFermer={() => setChoixClient(false)}
          onCree={() => clients.recharger()}
        />
      ) : null}

      {ticket ? <Ticket vente={ticket} onFermer={() => setTicket(null)} /> : null}
    </>
  )
}

// ===========================================================================
// Sélection et création rapide d'un client
// ===========================================================================

function ChoixClient({
  clients,
  onChoisir,
  onFermer,
  onCree
}: {
  clients: Client[]
  onChoisir: (id: number) => void
  onFermer: () => void
  onCree: () => void
}) {
  const session = useSession()
  const action = useAction()
  const [recherche, setRecherche] = useState('')
  const [creation, setCreation] = useState(false)
  const [nom, setNom] = useState('')
  const [telephone, setTelephone] = useState('')

  const filtres = clients.filter(
    (c) =>
      c.nom.toLowerCase().includes(recherche.toLowerCase()) ||
      (c.telephone ?? '').includes(recherche)
  )

  async function creer(): Promise<void> {
    const id = await action.executer<number>('clients.enregistrer', {
      id: null,
      donnees: { nom: nom.trim(), telephone: telephone.trim() || null }
    })
    if (id) {
      onCree()
      onChoisir(id)
    }
  }

  return (
    <Modale
      titre={creation ? 'Nouveau client' : 'Associer un client'}
      description={
        creation ? undefined : 'Le client est facultatif : une vente au comptoir n’en exige pas.'
      }
      onFermer={onFermer}
      pied={
        creation ? (
          <>
            <Bouton onClick={() => setCreation(false)}>Retour</Bouton>
            <Bouton variante="principal" disabled={nom.trim().length < 2} enCours={action.enCours} onClick={creer}>
              Créer et associer
            </Bouton>
          </>
        ) : session.peut('clients.gerer') ? (
          <Bouton icone="plus" onClick={() => setCreation(true)}>
            Nouveau client
          </Bouton>
        ) : null
      }
    >
      {creation ? (
        <div className="panneau-corps pile">
          {action.erreur ? <Bandeau ton="danger">{action.erreur.message}</Bandeau> : null}
          <Champ libelle="Nom" obligatoire value={nom} onChange={(e) => setNom(e.target.value)} autoFocus />
          <Champ libelle="Téléphone" value={telephone} onChange={(e) => setTelephone(e.target.value)} />
        </div>
      ) : (
        <>
          <div className="tableau-outils">
            <RechercheTableau valeur={recherche} onChange={setRecherche} placeholder="Nom ou téléphone…" largeur={330} />
          </div>
          {filtres.length === 0 ? (
            <EtatVide icone="client" titre={clients.length ? 'Aucun client trouvé' : 'Aucun client enregistré'}>
              {clients.length
                ? 'Modifiez votre recherche ou créez un nouveau client.'
                : 'Les clients enregistrés permettent de suivre un historique et d’accorder du crédit.'}
            </EtatVide>
          ) : (
            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
              {filtres.map((c) => (
                <button key={c.id} className="produit-ligne" onClick={() => onChoisir(c.id)}>
                  <span className="nom">
                    <strong>{c.nom}</strong>
                    <span>{c.telephone ?? 'Sans téléphone'}</span>
                  </span>
                  {(c.solde_du ?? 0) > 0 ? (
                    <Etiquette ton="attention">{montant(c.solde_du)} dû</Etiquette>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Modale>
  )
}

// ===========================================================================
// Ticket de vente
// ===========================================================================

function Ticket({ vente, onFermer }: { vente: VenteDetail; onFermer: () => void }) {
  return (
    <Modale
      titre="Vente enregistrée"
      description={`${vente.reference} · ${heure(vente.at)}`}
      onFermer={onFermer}
      pied={
        <>
          <Bouton icone="imprimer" onClick={() => window.print()}>
            Imprimer le ticket
          </Bouton>
          <Bouton variante="principal" icone="plus" onClick={onFermer}>
            Nouvelle vente
          </Bouton>
        </>
      }
    >
      <div className="panneau-corps">
        {vente.monnaie_rendue > 0 ? (
          <div style={{ marginBottom: 12 }}>
            <Bandeau ton="succes" titre={`Monnaie à rendre : ${montant(vente.monnaie_rendue)}`} />
          </div>
        ) : null}
        {vente.reste_a_payer > 0 ? (
          <div style={{ marginBottom: 12 }}>
            <Bandeau ton="attention" titre={`Crédit accordé : ${montant(vente.reste_a_payer)}`}>
              Cette somme est enregistrée comme créance sur le compte du client.
            </Bandeau>
          </div>
        ) : null}

        <table className="tableau">
          <thead>
            <tr>
              <th>Produit</th>
              <th>Lot</th>
              <th className="cellule-nombre">Qté</th>
              <th className="cellule-nombre">Montant</th>
            </tr>
          </thead>
          <tbody>
            {vente.lignes.map((l) => (
              <tr key={l.id}>
                <td>{l.designation}</td>
                <td style={{ color: 'var(--texte-faible)' }}>{l.numero_lot ?? '—'}</td>
                <td className="cellule-nombre">{l.quantite}</td>
                <td className="cellule-nombre">{montant(l.montant)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 14 }}>
          <dl className="liste-definitions">
            <dt>Sous-total</dt>
            <dd>{montant(vente.sous_total)}</dd>
            {vente.remise > 0 ? (
              <>
                <dt>Remise</dt>
                <dd>− {montant(vente.remise)}</dd>
              </>
            ) : null}
            <dt>Total</dt>
            <dd style={{ fontWeight: 700, color: 'var(--accent-fonce)' }}>{montant(vente.total)}</dd>
            {vente.paiements.map((p, i) => (
              <Fragment key={i}>
                <dt>{modePaiement(p.mode)}</dt>
                <dd>{montant(p.montant)}</dd>
              </Fragment>
            ))}
          </dl>
        </div>
      </div>
    </Modale>
  )
}

// ===========================================================================
// Historique
// ===========================================================================

function Historique({ destination }: { destination: Destination }) {
  const session = useSession()
  const notifications = useNotifications()
  const [recherche, setRecherche] = useState('')
  const [periode, setPeriode] = useState<'jour' | 'semaine' | 'mois' | 'tout'>('jour')
  const [detail, setDetail] = useState<number | null>(
    destination.cible?.type === 'vente' ? destination.cible.id : null
  )

  const depuisDate = useMemo(() => {
    if (periode === 'tout') return undefined
    const d = new Date()
    if (periode === 'semaine') d.setDate(d.getDate() - 7)
    else if (periode === 'mois') d.setMonth(d.getMonth() - 1)
    else d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }, [periode])

  const ventes = useRequete<Vente[]>('ventes.lister', {
    depuis: depuisDate,
    recherche: recherche.trim() || undefined,
    limite: 300
  })

  return (
    <>
      <Tableau
        colonnes={[
          {
            cle: 'reference',
            entete: 'Référence',
            largeur: '130px',
            triSur: (v: Vente) => v.reference,
            rendu: (v: Vente) => (
              <CellulePrincipale titre={v.reference} sous={dateCourte(v.at)} />
            )
          },
          {
            cle: 'client',
            entete: 'Client',
            rendu: (v: Vente) => v.client_nom ?? <span style={{ color: 'var(--texte-faible)' }}>Client de passage</span>,
            triSur: (v: Vente) => v.client_nom ?? ''
          },
          {
            cle: 'utilisateur',
            entete: 'Vendeur',
            rendu: (v: Vente) => v.utilisateur ?? '—',
            triSur: (v: Vente) => v.utilisateur ?? ''
          },
          {
            cle: 'articles',
            entete: 'Articles',
            nombre: true,
            rendu: (v: Vente) => nombre(v.nb_articles ?? 0),
            triSur: (v: Vente) => v.nb_articles ?? 0
          },
          {
            cle: 'total',
            entete: 'Total',
            nombre: true,
            rendu: (v: Vente) => <strong>{montant(v.total)}</strong>,
            triSur: (v: Vente) => v.total
          },
          {
            cle: 'statut',
            entete: 'Statut',
            largeur: '120px',
            rendu: (v: Vente) =>
              v.statut === 'annulee' ? (
                <Etiquette ton="danger">Annulée</Etiquette>
              ) : v.reste_a_payer > 0 ? (
                <Etiquette ton="attention">Crédit</Etiquette>
              ) : (
                <Etiquette ton="succes">Réglée</Etiquette>
              )
          },
          {
            cle: 'quand',
            entete: 'Enregistrée',
            largeur: '130px',
            rendu: (v: Vente) => <span style={{ color: 'var(--texte-faible)' }}>{depuis(v.at)}</span>,
            triSur: (v: Vente) => v.at
          }
        ]}
        lignes={ventes.donnees}
        cle={(v) => v.id}
        chargement={ventes.chargement}
        erreur={ventes.erreur}
        onReessayer={ventes.recharger}
        onLigneClic={(v) => setDetail(v.id)}
        parPage={25}
        filtreActif={recherche.trim().length > 0}
        resume={(n) => `${n} vente${n > 1 ? 's' : ''}`}
        outils={
          <>
            <RechercheTableau valeur={recherche} onChange={setRecherche} placeholder="Référence ou client…" />
            <Segments
              valeur={periode}
              options={[
                { valeur: 'jour', libelle: "Aujourd'hui" },
                { valeur: 'semaine', libelle: '7 jours' },
                { valeur: 'mois', libelle: '30 jours' },
                { valeur: 'tout', libelle: 'Tout' }
              ]}
              onChange={setPeriode}
            />
          </>
        }
        vide={
          <EtatVide icone="vente" titre="Aucune vente sur cette période">
            Les ventes finalisées apparaîtront ici avec leur détail par lot.
          </EtatVide>
        }
        videApresFiltre={
          <EtatVide icone="recherche" titre="Aucune vente ne correspond">
            Modifiez la recherche ou élargissez la période.
          </EtatVide>
        }
      />

      {detail !== null ? (
        <DetailVente
          id={detail}
          onFermer={() => setDetail(null)}
          onAnnulee={() => {
            setDetail(null)
            ventes.recharger()
            notifications.succes('Vente annulée', 'Le stock a été restitué dans ses lots d’origine.')
          }}
          peutAnnuler={session.peut('ventes.annuler')}
        />
      ) : null}
    </>
  )
}

function DetailVente({
  id,
  onFermer,
  onAnnulee,
  peutAnnuler
}: {
  id: number
  onFermer: () => void
  onAnnulee: () => void
  peutAnnuler: boolean
}) {
  const vente = useRequete<VenteDetail>('ventes.detail', { id })
  const action = useAction()
  const [motif, setMotif] = useState('')
  const [annulation, setAnnulation] = useState(false)

  async function annuler(): Promise<void> {
    const resultat = await action.executer('ventes.annuler', { id, motif: motif.trim() })
    if (resultat !== null) onAnnulee()
  }

  if (!vente.donnees) {
    return (
      <Modale titre="Détail de la vente" onFermer={onFermer}>
        <div className="panneau-corps">
          {vente.erreur ? <Bandeau ton="danger">{vente.erreur.message}</Bandeau> : <Chargeur />}
        </div>
      </Modale>
    )
  }

  const v = vente.donnees

  if (annulation) {
    return (
      <Modale
        titre={`Annuler la vente ${v.reference}`}
        onFermer={() => setAnnulation(false)}
        pied={
          <>
            <Bouton onClick={() => setAnnulation(false)}>Revenir</Bouton>
            <Bouton
              variante="danger"
              disabled={motif.trim().length < 3}
              enCours={action.enCours}
              onClick={annuler}
            >
              Confirmer l’annulation
            </Bouton>
          </>
        }
      >
        <div className="panneau-corps pile">
          <Bandeau ton="attention" titre="Cette opération est définitive">
            Le stock de {v.lignes.length} ligne(s) sera restitué dans les lots d’origine, et la vente
            restera visible dans l’historique avec son motif d’annulation.
          </Bandeau>
          {action.erreur ? <Bandeau ton="danger">{action.erreur.message}</Bandeau> : null}
          <ZoneTexte
            libelle="Motif de l’annulation"
            obligatoire
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Erreur de saisie, retour client, produit non délivré…"
          />
        </div>
      </Modale>
    )
  }

  return (
    <Modale
      titre={`Vente ${v.reference}`}
      description={`${dateCourte(v.at)} à ${heure(v.at)} · ${v.utilisateur ?? ''}`}
      large
      onFermer={onFermer}
      pied={
        <>
          {peutAnnuler && v.statut === 'finalisee' ? (
            <Bouton className="a-gauche" variante="danger" icone="croix" onClick={() => setAnnulation(true)}>
              Annuler cette vente
            </Bouton>
          ) : null}
          <Bouton icone="imprimer" onClick={() => window.print()}>
            Imprimer
          </Bouton>
          <Bouton variante="principal" onClick={onFermer}>
            Fermer
          </Bouton>
        </>
      }
    >
      <div className="panneau-corps">
        {v.statut === 'annulee' ? (
          <div style={{ marginBottom: 12 }}>
            <Bandeau ton="danger" titre="Vente annulée">
              {v.note ?? 'Le stock a été restitué.'}
            </Bandeau>
          </div>
        ) : null}

        <table className="tableau">
          <thead>
            <tr>
              <th>Produit</th>
              <th>Lot servi</th>
              <th className="cellule-nombre">Qté</th>
              <th className="cellule-nombre">Prix unitaire</th>
              <th className="cellule-nombre">Montant</th>
            </tr>
          </thead>
          <tbody>
            {v.lignes.map((l) => (
              <tr key={l.id}>
                <td>{l.designation}</td>
                <td style={{ color: 'var(--texte-faible)' }}>{l.numero_lot ?? 'Sans numéro'}</td>
                <td className="cellule-nombre">{l.quantite}</td>
                <td className="cellule-nombre">{montant(l.prix_unitaire)}</td>
                <td className="cellule-nombre">{montant(l.montant)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <div className="formulaire-titre">Paiements</div>
            <dl className="liste-definitions">
              {v.paiements.map((p, i) => (
                <Fragment key={i}>
                  <dt>{modePaiement(p.mode)}</dt>
                  <dd>{montant(p.montant)}</dd>
                </Fragment>
              ))}
              {v.monnaie_rendue > 0 ? (
                <>
                  <dt>Monnaie rendue</dt>
                  <dd>{montant(v.monnaie_rendue)}</dd>
                </>
              ) : null}
            </dl>
          </div>
          <div>
            <div className="formulaire-titre">Totaux</div>
            <dl className="liste-definitions">
              <dt>Sous-total</dt>
              <dd>{montant(v.sous_total)}</dd>
              <dt>Remise</dt>
              <dd>{v.remise > 0 ? `− ${montant(v.remise)}` : '—'}</dd>
              <dt>Total</dt>
              <dd style={{ fontWeight: 700 }}>{montant(v.total)}</dd>
              {v.reste_a_payer > 0 ? (
                <>
                  <dt>Reste dû</dt>
                  <dd style={{ color: 'var(--attention)' }}>{montant(v.reste_a_payer)}</dd>
                </>
              ) : null}
            </dl>
          </div>
        </div>
      </div>
    </Modale>
  )
}

function Chargeur() {
  return (
    <div className="chargement">
      <span className="rotateur" />
      Chargement…
    </div>
  )
}
