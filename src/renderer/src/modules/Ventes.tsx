import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  ApercuCompte,
  Avertissement,
  Client,
  DemandeVente,
  ModePaiement,
  Pharmacie,
  ProduitEtat,
  Vente,
  VenteDetail
} from '@shared/types'
import { useAction, useDifferee, useRequete } from '../lib/hooks'
import { appeler } from '../lib/api'
import { useSession } from '../app/Session'
import { useNavigation, type Destination } from '../app/navigation'
import { useFonctions } from '../app/fonctions'
import { useNotifications } from '../ui/Notifications'
import { signalerCaisseModifiee } from '../lib/evenements'
import { useLecteurCodeBarres } from '../lib/codeBarres'
import { useImpression, FORMATS, type FormatImpression } from '../ui/Impression'
import { FactureVente, TicketDeCaisse } from '../ui/Documents'
import Icone from '../ui/Icone'
import {
  Bandeau,
  Bouton,
  BoutonIcone,
  Champ,
  ChampMontant,
  Chargement,
  EntetePage,
  Etiquette,
  EtatVide,
  Modale,
  Segments,
  ZoneTexte
} from '../ui/Composants'
import Tableau, { CellulePrincipale, RechercheTableau } from '../ui/Tableau'
import { dateCourte, depuis, heure, modePaiement, montant, nombre, versEntier } from '../lib/format'

interface LignePanier {
  produit: ProduitEtat
  quantite: number
  remise: number
}

interface Reglement {
  id: number
  mode: Exclude<ModePaiement, 'credit'>
  montant: number
}

const MODES: { valeur: Reglement['mode']; libelle: string }[] = [
  { valeur: 'especes', libelle: 'Espèces' },
  { valeur: 'mobile_money', libelle: 'Mobile Money' },
  { valeur: 'carte', libelle: 'Carte bancaire' },
  { valeur: 'virement', libelle: 'Virement' },
  { valeur: 'cheque', libelle: 'Chèque' }
]

const APPOINTS = [500, 1000, 2000, 5000, 10_000]

interface Reglages {
  formatImpressionDefaut: FormatImpression
  ticketAutomatique: boolean
  piedTicket: string
  copiesFacture: number
  scanAjouteDirectement: boolean
  avertirScanInconnu: boolean
}

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
        titre={onglet === 'comptoir' ? 'Comptoir' : 'Historique des ventes'}
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
  const { imprimer } = useImpression()
  const action = useAction()

  const [saisie, setSaisie] = useState('')
  const [panier, setPanier] = useState<LignePanier[]>([])
  const [clientId, setClientId] = useState<number | null>(null)
  const [reglements, setReglements] = useState<Reglement[]>([{ id: 1, mode: 'especes', montant: 0 }])
  const [reglementAjuste, setReglementAjuste] = useState(false)
  const [note, setNote] = useState('')
  const [survol, setSurvol] = useState(0)
  const [choixClient, setChoixClient] = useState(false)
  const [saisieRemise, setSaisieRemise] = useState(false)
  const [ticket, setTicket] = useState<VenteDetail | null>(null)
  const [derniereVente, setDerniereVente] = useState<VenteDetail | null>(null)
  const [scanInconnu, setScanInconnu] = useState<string | null>(null)

  const champRecherche = useRef<HTMLInputElement>(null)
  const compteurReglement = useRef(1)
  const differee = useDifferee(saisie, 140)

  const caisse = useRequete<{ session: { reference: string } | null }>('caisse.etat')
  const reglages = useRequete<Reglages>('app.reglages')
  const resultats = useRequete<ProduitEtat[]>(
    'produits.rechercheRapide',
    { saisie: differee },
    differee.trim().length >= 2
  )
  const compte = useRequete<ApercuCompte>(
    'clients.apercuCompte',
    { id: clientId },
    clientId !== null && session.peut('clients.voir')
  )

  const sousTotal = panier.reduce((s, l) => s + l.produit.prix_vente * l.quantite, 0)
  const remise = panier.reduce((s, l) => s + l.remise, 0)
  const total = sousTotal - remise
  const totalRegle = reglements.reduce((s, r) => s + r.montant, 0)
  const monnaie = Math.max(0, totalRegle - total)
  const reste = Math.max(0, total - totalRegle)

  const demande = useMemo<DemandeVente>(
    () => ({
      clientId,
      lignes: panier.map((l) => ({ produitId: l.produit.id, quantite: l.quantite, remise: l.remise })),
      paiements: reglements.filter((r) => r.montant > 0).map((r) => ({ mode: r.mode, montant: r.montant })),
      note: note.trim() || undefined
    }),
    [panier, clientId, reglements, note]
  )

  const controle = useRequete<{ avertissements: Avertissement[] }>(
    'ventes.verifier',
    demande,
    panier.length > 0
  )

  const avertissements = controle.donnees?.avertissements ?? []
  const bloquants = avertissements.filter((a) => a.bloquant)
  const signalements = avertissements.filter((a) => !a.bloquant)

  // Le premier règlement suit le total tant que le caissier ne l'a pas corrigé :
  // le compte juste est le cas courant, et cela évite d'annoncer un crédit
  // alors qu'aucun paiement n'a encore été saisi.
  useEffect(() => {
    if (reglementAjuste) return
    setReglements((r) => (r.length === 1 ? [{ ...r[0]!, montant: total }] : r))
  }, [total, reglementAjuste])

  const ajouter = useCallback((produit: ProduitEtat) => {
    if (produit.stock_disponible <= 0) return
    setPanier((precedent) => {
      const existante = precedent.find((l) => l.produit.id === produit.id)
      if (existante) {
        return precedent.map((l) => (l.produit.id === produit.id ? { ...l, quantite: l.quantite + 1 } : l))
      }
      return [...precedent, { produit, quantite: 1, remise: 0 }]
    })
    setSaisie('')
    champRecherche.current?.focus()
  }, [])

  /**
   * Ajouter un produit dont on ne connait que l'identifiant.
   *
   * Le panneau des equivalents ne porte que le strict necessaire a l'affichage ;
   * le panier, lui, a besoin de la fiche complete — prix, TVA, ordonnance.
   */
  const ajouterParId = useCallback(
    async (id: number) => {
      try {
        const produit = await appeler<ProduitEtat>('produits.detail', { id })
        ajouter(produit)
      } catch {
        // Un equivalent devenu indisponible entre l'affichage et le clic : on
        // laisse le comptoir tranquille plutot que d'ouvrir une alerte.
      }
    },
    [ajouter]
  )

  function changerQuantite(produitId: number, quantite: number): void {
    setPanier((precedent) =>
      quantite <= 0
        ? precedent.filter((l) => l.produit.id !== produitId)
        : precedent.map((l) => (l.produit.id === produitId ? { ...l, quantite } : l))
    )
  }

  const viderPanier = useCallback(() => {
    setPanier([])
    setClientId(null)
    setNote('')
    setReglementAjuste(false)
    compteurReglement.current = 1
    setReglements([{ id: 1, mode: 'especes', montant: 0 }])
    champRecherche.current?.focus()
  }, [])

  function modifierReglement(id: number, champs: Partial<Reglement>): void {
    setReglementAjuste(true)
    setReglements((r) => r.map((l) => (l.id === id ? { ...l, ...champs } : l)))
  }

  function ajouterReglement(): void {
    setReglementAjuste(true)
    compteurReglement.current += 1
    setReglements((r) => [
      ...r,
      { id: compteurReglement.current, mode: 'mobile_money', montant: Math.max(0, reste) }
    ])
  }

  function retirerReglement(id: number): void {
    setReglementAjuste(true)
    setReglements((r) => (r.length === 1 ? r : r.filter((l) => l.id !== id)))
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


  // --- Lecteur de codes-barres ---------------------------------------------
  const traiterScan = useCallback(
    async (code: string) => {
      setScanInconnu(null)
      const produit = await appeler<ProduitEtat | null>('produits.parCodeBarres', { code })

      if (!produit) {
        // Le panneau de rattachement affiche déjà le code lu : le reporter
        // aussi dans la recherche ferait doublon, avec un « aucun produit »
        // sous les yeux pendant qu'on désigne le bon.
        if (reglages.donnees?.avertirScanInconnu !== false) {
          setSaisie('')
          setScanInconnu(code)
        } else {
          setSaisie(code)
        }
        return
      }

      if (produit.stock_disponible <= 0) {
        setSaisie(produit.nom_commercial)
        notifications.attention(
          'Produit en rupture',
          `${produit.nom_commercial} a été reconnu mais son stock est épuisé.`
        )
        return
      }

      if (reglages.donnees?.scanAjouteDirectement === false) {
        setSaisie(produit.nom_commercial)
        return
      }

      ajouter(produit)
    },
    [ajouter, notifications, reglages.donnees]
  )

  // Le lecteur est neutralisé pendant qu'une fenêtre modale est ouverte :
  // il ne doit pas alimenter le panier pendant la saisie d'un client.
  const modaleOuverte = choixClient || saisieRemise || ticket !== null
  useLecteurCodeBarres({ onScan: traiterScan, actif: !modaleOuverte })

  useEffect(() => setSurvol(0), [differee])

  const imprimerVente = useCallback(
    (vente: VenteDetail, format: FormatImpression, duplicata?: boolean) => {
      const document: ReactNode =
        format === 'ticket' || format === 'ticket57' ? (
          <TicketDeCaisse
            vente={vente}
            pharmacie={session.pharmacie}
            clientNom={vente.client_nom ?? null}
            pied={reglages.donnees?.piedTicket}
            copie={duplicata ? 'DUPLICATA' : undefined}
          />
        ) : (
          <FactureVente
            vente={vente}
            pharmacie={session.pharmacie}
            clientNom={vente.client_nom ?? null}
            duplicata={duplicata}
          />
        )
      imprimer(document, format)
    },
    [imprimer, session.pharmacie, reglages.donnees]
  )

  const formatDefaut: FormatImpression = reglages.donnees?.formatImpressionDefaut ?? 'ticket'

  const finaliser = useCallback(async () => {
    if (!panier.length || bloquants.length) return
    const resultat = await action.executer<VenteDetail>('ventes.enregistrer', demande)
    if (resultat) {
      setDerniereVente(resultat)
      setTicket(resultat)
      if (reglages.donnees?.ticketAutomatique) imprimerVente(resultat, formatDefaut)
      viderPanier()
      caisse.recharger()
      signalerCaisseModifiee()
      if (clientId) compte.recharger()
      notifications.succes('Vente enregistrée', `${resultat.reference} — ${montant(resultat.total)}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panier.length, bloquants.length, demande, clientId, formatDefaut])

  useFonctions('comptoir', [
    { touche: 'F2', libelle: 'Rechercher', action: () => champRecherche.current?.focus() },
    {
      touche: 'F4',
      libelle: clientId ? 'Changer de client' : 'Associer un client',
      action: () => setChoixClient(true),
      disponible: session.peut('clients.voir')
    },
    {
      touche: 'F6',
      libelle: 'Remise',
      action: () => setSaisieRemise(true),
      disponible: session.peut('ventes.remise') && panier.length > 0
    },
    {
      touche: 'F8',
      libelle: 'Vider le panier',
      action: viderPanier,
      disponible: panier.length > 0
    },
    {
      touche: 'F9',
      libelle: 'Encaisser',
      action: finaliser,
      disponible: panier.length > 0 && bloquants.length === 0,
      saillante: true
    },
    {
      touche: 'F12',
      libelle: 'Réimprimer le dernier ticket',
      action: () => derniereVente && imprimerVente(derniereVente, formatDefaut, true),
      disponible: derniereVente !== null
    }
  ])

  const caisseFermee = caisse.donnees !== null && caisse.donnees.session === null
  const c = compte.donnees
  const depasse = c !== null && c !== undefined && c.disponible !== null && reste > c.disponible

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
            Chaque vente doit être rattachée à une session de caisse.
          </Bandeau>
        </div>
      ) : null}

      {scanInconnu ? (
        <RattacherCode
          code={scanInconnu}
          onRattache={(produit) => {
            setScanInconnu(null)
            setSaisie('')
            if (produit.stock_disponible > 0) ajouter(produit)
            else
              notifications.attention(
                'Produit en rupture',
                `${produit.nom_commercial} est reconnu, mais son stock est épuisé.`
              )
          }}
          onCreer={() => {
            setScanInconnu(null)
            naviguer({ module: 'produits', filtre: 'nouveau' })
          }}
          onFermer={() => {
            setSaisie(scanInconnu)
            setScanInconnu(null)
          }}
        />
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
                Entrée ajoutent au panier sans quitter le clavier.
              </EtatVide>
            ) : resultats.chargement && !resultats.donnees ? (
              <Chargement libelle="Recherche…" />
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
                      <span>{[produit.forme, produit.emplacement].filter(Boolean).join(' · ')}</span>
                    </span>
                    <Etiquette
                      ton={rupture ? 'danger' : produit.etat_stock === 'faible' ? 'attention' : 'succes'}
                    >
                      {rupture ? 'Rupture' : `${nombre(produit.stock_disponible)} en stock`}
                    </Etiquette>
                    <span className="prix">{montant(produit.prix_vente)}</span>
                    {!rupture ? <Icone nom="plus" taille={15} /> : null}
                  </button>
                )
              })
            )}
          </section>

          <FicheComptoir produit={resultats.donnees?.[survol] ?? null} onChoisir={ajouterParId} />
        </div>

        <aside className="panneau panier">
          <header className="panneau-entete">
            <div>
              <h2>Panier</h2>
              <p>
                {panier.reduce((s, l) => s + l.quantite, 0)} article
                {panier.reduce((s, l) => s + l.quantite, 0) > 1 ? 's' : ''}
                {remise > 0 ? ` · remise ${montant(remise)}` : ''}
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
                      {montant(ligne.produit.prix_vente)} × {ligne.quantite}
                      {ligne.remise > 0 ? ` − ${montant(ligne.remise)}` : ''} ={' '}
                      {montant(ligne.produit.prix_vente * ligne.quantite - ligne.remise)}
                    </span>
                  </div>
                  <div className="quantite">
                    <button
                      onClick={() => changerQuantite(ligne.produit.id, ligne.quantite - 1)}
                      aria-label="Retirer un"
                    >
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

          {signalements.length > 0 || bloquants.length > 0 ? (
            <div style={{ padding: '10px 12px', display: 'grid', gap: 6 }}>
              {bloquants.map((a, i) => (
                <Bandeau key={`b${i}`} ton="danger" titre={a.message}>
                  {a.detail}
                </Bandeau>
              ))}
              {signalements.map((a, i) => (
                <Bandeau key={`s${i}`} ton="attention" titre={a.message}>
                  {a.detail}
                </Bandeau>
              ))}
            </div>
          ) : null}

          <div className="total-a-payer">
            <span>Total à payer</span>
            <strong>{montant(total)}</strong>
          </div>

          {session.peut('clients.voir') ? (
            <div style={{ padding: '10px 12px 0' }}>
              {c ? (
                <div className={`compte-client${depasse ? ' alerte' : ''}`}>
                  <div className="compte-client-entete">
                    <strong>{c.nom}</strong>
                    <div className="rangee" style={{ gap: 2 }}>
                      <Bouton compact variante="discret" onClick={() => setChoixClient(true)}>
                        Changer
                      </Bouton>
                      <Bouton compact variante="discret" onClick={() => setClientId(null)}>
                        Retirer
                      </Bouton>
                    </div>
                  </div>
                  <div className="compte-chiffre">
                    <span>Encours du compte</span>
                    <b>{montant(c.encours)}</b>
                  </div>
                  {c.plafond > 0 ? (
                    <div className="compte-chiffre">
                      <span>Crédit disponible</span>
                      <b>{montant(c.disponible ?? 0)}</b>
                    </div>
                  ) : (
                    <div className="compte-chiffre">
                      <span>Plafond de crédit</span>
                      <b>Aucun</b>
                    </div>
                  )}
                  <div className="compte-chiffre">
                    <span>{c.nbVentes} vente(s) · dernière visite</span>
                    <b>{c.derniereVisite ? depuis(c.derniereVisite) : '—'}</b>
                  </div>
                </div>
              ) : (
                <Bouton pleine icone="client" onClick={() => setChoixClient(true)}>
                  Associer un client <span className="raccourci">F4</span>
                </Bouton>
              )}
            </div>
          ) : null}

          <div className="reglement">
            <div className="reglement-titre">
              <span>Règlement</span>
              <button
                type="button"
                className="bouton discret compact"
                onClick={ajouterReglement}
                disabled={panier.length === 0}
              >
                <Icone nom="plus" taille={12} /> Paiement mixte
              </button>
            </div>

            {reglements.map((r) => (
              <div className="reglement-ligne" key={r.id}>
                <select
                  value={r.mode}
                  onChange={(e) => modifierReglement(r.id, { mode: e.target.value as Reglement['mode'] })}
                  aria-label="Mode de règlement"
                >
                  {MODES.map((m) => (
                    <option key={m.valeur} value={m.valeur}>
                      {m.libelle}
                    </option>
                  ))}
                </select>
                <input
                  inputMode="decimal"
                  value={montant(r.montant, false)}
                  onChange={(e) => modifierReglement(r.id, { montant: versEntier(e.target.value) })}
                  aria-label="Montant réglé"
                />
                {reglements.length > 1 ? (
                  <BoutonIcone
                    icone="croix"
                    titre="Retirer ce règlement"
                    onClick={() => retirerReglement(r.id)}
                  />
                ) : (
                  <span />
                )}
              </div>
            ))}

            <div className="appoints">
              <button
                type="button"
                className="appoint"
                onClick={() => {
                  setReglementAjuste(true)
                  setReglements((liste) => [{ ...liste[0]!, montant: total }, ...liste.slice(1)])
                }}
              >
                Compte juste
              </button>
              {APPOINTS.map((valeur) => (
                <button
                  key={valeur}
                  type="button"
                  className="appoint"
                  onClick={() => {
                    setReglementAjuste(true)
                    setReglements((liste) => [
                      { ...liste[0]!, montant: liste[0]!.montant + valeur },
                      ...liste.slice(1)
                    ])
                  }}
                >
                  +{montant(valeur, false)}
                </button>
              ))}
            </div>
          </div>

          <div className="bilan">
            <div className="bilan-ligne">
              <span>Total réglé</span>
              <strong>{montant(totalRegle)}</strong>
            </div>
            {monnaie > 0 ? (
              <div className="bilan-ligne rendu saillant">
                <span>Monnaie à rendre</span>
                <strong>{montant(monnaie)}</strong>
              </div>
            ) : null}
            {reste > 0 && panier.length > 0 ? (
              <div className="bilan-ligne credit saillant">
                <span>Reste à payer (crédit)</span>
                <strong>{montant(reste)}</strong>
              </div>
            ) : null}
          </div>

          <div className="panneau-corps">
            {action.erreur ? (
              <div style={{ marginBottom: 10 }}>
                <Bandeau ton="danger">{action.erreur.message}</Bandeau>
              </div>
            ) : null}
            <Bouton
              variante="principal"
              pleine
              icone="coche"
              disabled={panier.length === 0 || bloquants.length > 0}
              enCours={action.enCours}
              onClick={finaliser}
            >
              Encaisser <span className="raccourci">F9</span>
            </Bouton>
          </div>
        </aside>
      </div>

      {choixClient ? (
        <ChoixClient
          onChoisir={(id) => {
            setClientId(id)
            setChoixClient(false)
          }}
          onFermer={() => setChoixClient(false)}
        />
      ) : null}

      {saisieRemise ? (
        <SaisieRemise
          panier={panier}
          onFermer={() => setSaisieRemise(false)}
          onAppliquer={(remises) => {
            setPanier((p) => p.map((l) => ({ ...l, remise: remises[l.produit.id] ?? 0 })))
            setSaisieRemise(false)
          }}
        />
      ) : null}

      {ticket ? (
        <RecapitulatifVente
          vente={ticket}
          pharmacie={session.pharmacie}
          formatDefaut={formatDefaut}
          onImprimer={(format) => imprimerVente(ticket, format)}
          onFermer={() => {
            setTicket(null)
            champRecherche.current?.focus()
          }}
        />
      ) : null}
    </>
  )
}

// ===========================================================================
// Remise par ligne
// ===========================================================================

function SaisieRemise({
  panier,
  onFermer,
  onAppliquer
}: {
  panier: LignePanier[]
  onFermer: () => void
  onAppliquer: (remises: Record<number, number>) => void
}) {
  const [remises, setRemises] = useState<Record<number, number>>(
    Object.fromEntries(panier.map((l) => [l.produit.id, l.remise]))
  )

  const totalRemise = Object.values(remises).reduce((s, v) => s + v, 0)
  const brut = panier.reduce((s, l) => s + l.produit.prix_vente * l.quantite, 0)
  const excessive = panier.some((l) => (remises[l.produit.id] ?? 0) > l.produit.prix_vente * l.quantite)

  return (
    <Modale
      titre="Appliquer une remise"
      description="La remise se saisit ligne par ligne, en valeur."
      onFermer={onFermer}
      pied={
        <>
          <span className="a-gauche" style={{ fontSize: 12.5, color: 'var(--texte-attenue)' }}>
            Remise totale : <strong>{montant(totalRemise)}</strong> sur {montant(brut)}
          </span>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="principal" disabled={excessive} onClick={() => onAppliquer(remises)}>
            Appliquer
          </Bouton>
        </>
      }
    >
      <div className="panneau-corps pile">
        {excessive ? (
          <Bandeau ton="danger">Une remise ne peut pas dépasser le montant de sa ligne.</Bandeau>
        ) : null}
        {panier.map((l) => (
          <ChampMontant
            key={l.produit.id}
            libelle={`${l.produit.nom_commercial} ${l.produit.dosage ?? ''}`}
            aide={`${l.quantite} × ${montant(l.produit.prix_vente)} = ${montant(l.produit.prix_vente * l.quantite)}`}
            valeur={remises[l.produit.id] ?? 0}
            onChangeValeur={(v) => setRemises((r) => ({ ...r, [l.produit.id]: v }))}
          />
        ))}
      </div>
    </Modale>
  )
}

// ===========================================================================
// Sélection et création rapide d'un client
// ===========================================================================

function ChoixClient({
  onChoisir,
  onFermer
}: {
  onChoisir: (id: number) => void
  onFermer: () => void
}) {
  const session = useSession()
  const action = useAction()
  const [recherche, setRecherche] = useState('')
  const [creation, setCreation] = useState(false)
  const [nom, setNom] = useState('')
  const [telephone, setTelephone] = useState('')
  const [plafond, setPlafond] = useState(0)

  const clients = useRequete<Client[]>('clients.lister', { recherche: recherche.trim() || undefined })
  const liste = clients.donnees ?? []

  async function creer(): Promise<void> {
    const id = await action.executer<number>('clients.enregistrer', {
      id: null,
      donnees: { nom: nom.trim(), telephone: telephone.trim() || null, plafondCredit: plafond }
    })
    if (id) onChoisir(id)
  }

  return (
    <Modale
      titre={creation ? 'Nouveau client' : 'Compte client'}
      description={
        creation
          ? 'Le plafond détermine le crédit que ce client pourra obtenir.'
          : 'Le client est facultatif : une vente au comptoir n’en exige pas.'
      }
      onFermer={onFermer}
      pied={
        creation ? (
          <>
            <Bouton onClick={() => setCreation(false)}>Retour</Bouton>
            <Bouton
              variante="principal"
              disabled={nom.trim().length < 2}
              enCours={action.enCours}
              onClick={creer}
            >
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
          <ChampMontant
            libelle="Plafond de crédit"
            valeur={plafond}
            onChangeValeur={setPlafond}
            aide="Laissez à zéro pour ne pas autoriser de crédit plafonné."
          />
        </div>
      ) : (
        <>
          <div className="tableau-outils">
            <RechercheTableau
              valeur={recherche}
              onChange={setRecherche}
              placeholder="Nom ou téléphone…"
              largeur={330}
            />
          </div>
          {clients.chargement && !clients.donnees ? (
            <Chargement />
          ) : liste.length === 0 ? (
            <EtatVide icone="client" titre={recherche ? 'Aucun client trouvé' : 'Aucun client enregistré'}>
              {recherche
                ? 'Modifiez votre recherche ou créez un nouveau client.'
                : 'Un compte client permet de suivre un historique et d’accorder du crédit.'}
            </EtatVide>
          ) : (
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {liste.map((c) => (
                <button key={c.id} className="produit-ligne" onClick={() => onChoisir(c.id)}>
                  <span className="nom">
                    <strong>{c.nom}</strong>
                    <span>
                      {c.telephone ?? 'Sans téléphone'}
                      {c.plafond_credit > 0 ? ` · plafond ${montant(c.plafond_credit)}` : ''}
                    </span>
                  </span>
                  {(c.solde_du ?? 0) > 0 ? (
                    <Etiquette ton="attention">{montant(c.solde_du)} dû</Etiquette>
                  ) : (
                    <Etiquette ton="succes">À jour</Etiquette>
                  )}
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
// Récapitulatif après encaissement
// ===========================================================================

function RecapitulatifVente({
  vente,
  pharmacie,
  formatDefaut,
  onImprimer,
  onFermer
}: {
  vente: VenteDetail
  pharmacie: Pharmacie
  formatDefaut: FormatImpression
  onImprimer: (format: FormatImpression) => void
  onFermer: () => void
}) {
  const [format, setFormat] = useState<FormatImpression>(formatDefaut)
  const rendu = vente.monnaie_rendue
  const credit = vente.reste_a_payer

  // La touche Entrée enchaîne sur la vente suivante : au comptoir, on ne
  // s'arrête pas pour cliquer.
  useEffect(() => {
    const gerer = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        onFermer()
      }
    }
    window.addEventListener('keydown', gerer)
    return () => window.removeEventListener('keydown', gerer)
  }, [onFermer])

  return (
    <Modale
      titre={`Vente ${vente.reference} enregistrée`}
      description={`${heure(vente.at)} · ${vente.utilisateur ?? ''}${pharmacie.ville ? ` · ${pharmacie.ville}` : ''}`}
      onFermer={onFermer}
      pied={
        <>
          <div className="a-gauche rangee" style={{ gap: 6 }}>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as FormatImpression)}
              aria-label="Format d’impression"
              style={{
                height: 32,
                padding: '0 8px',
                border: '1px solid var(--bordure-nette)',
                borderRadius: 4,
                fontSize: 12.5
              }}
            >
              {FORMATS.map((f) => (
                <option key={f.valeur} value={f.valeur}>
                  {f.libelle}
                </option>
              ))}
            </select>
            <Bouton icone="imprimer" onClick={() => onImprimer(format)}>
              Imprimer
            </Bouton>
          </div>
          <Bouton variante="principal" icone="plus" onClick={onFermer}>
            Vente suivante <span className="raccourci">Entrée</span>
          </Bouton>
        </>
      }
    >
      <div className="panneau-corps">
        {rendu > 0 ? (
          <div
            style={{
              padding: '14px 16px',
              marginBottom: 12,
              borderRadius: 6,
              background: 'var(--succes-fond)',
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between'
            }}
          >
            <span style={{ color: 'var(--succes)', fontWeight: 600 }}>Monnaie à rendre</span>
            <strong style={{ color: 'var(--succes)', fontSize: 28, fontVariantNumeric: 'tabular-nums' }}>
              {montant(rendu)}
            </strong>
          </div>
        ) : null}

        {credit > 0 ? (
          <div style={{ marginBottom: 12 }}>
            <Bandeau ton="attention" titre={`Crédit accordé : ${montant(credit)}`}>
              La somme est portée au compte de {vente.client_nom ?? 'ce client'} et apparaîtra sur son
              relevé.
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
            <dt>Total</dt>
            <dd style={{ fontWeight: 700 }}>{montant(vente.total)}</dd>
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
  const { imprimer } = useImpression()
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
  const reglages = useRequete<Reglages>('app.reglages')
  const formatDefaut: FormatImpression = reglages.donnees?.formatImpressionDefaut ?? 'ticket'

  // Une réimpression porte toujours la mention « duplicata » : un second
  // exemplaire ne doit jamais pouvoir passer pour l'original.
  const reimprimer = useCallback(
    async (venteId: number, format: FormatImpression = formatDefaut) => {
      const vente = await appeler<VenteDetail>('ventes.detail', { id: venteId })
      imprimer(
        format === 'ticket' || format === 'ticket57' ? (
          <TicketDeCaisse
            vente={vente}
            pharmacie={session.pharmacie}
            clientNom={vente.client_nom ?? null}
            pied={reglages.donnees?.piedTicket}
            copie="DUPLICATA"
          />
        ) : (
          <FactureVente
            vente={vente}
            pharmacie={session.pharmacie}
            clientNom={vente.client_nom ?? null}
            duplicata
          />
        ),
        format
      )
    },
    [imprimer, session.pharmacie, formatDefaut, reglages.donnees]
  )

  useFonctions('ventes-historique', [
    { touche: 'F5', libelle: 'Actualiser', action: () => ventes.recharger() },
    {
      touche: 'F12',
      libelle: 'Réimprimer la vente sélectionnée',
      action: () => detail !== null && reimprimer(detail),
      disponible: detail !== null
    },
    {
      touche: 'F8',
      libelle: 'Réimprimer en facture A4',
      action: () => detail !== null && reimprimer(detail, 'a4'),
      disponible: detail !== null
    }
  ])

  return (
    <>
      <Tableau
        colonnes={[
          {
            cle: 'reference',
            entete: 'Référence',
            largeur: '130px',
            triSur: (v: Vente) => v.at,
            rendu: (v: Vente) => <CellulePrincipale titre={v.reference} sous={dateCourte(v.at)} />
          },
          {
            cle: 'client',
            entete: 'Client',
            rendu: (v: Vente) =>
              v.client_nom ?? <span style={{ color: 'var(--texte-faible)' }}>Client de passage</span>,
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
          },
          {
            cle: 'actions',
            entete: '',
            actions: true,
            largeur: '110px',
            rendu: (v: Vente) => (
              <Bouton
                compact
                variante="discret"
                icone="imprimer"
                onClick={(e) => {
                  e.stopPropagation()
                  reimprimer(v.id)
                }}
              >
                Ticket
              </Bouton>
            )
          }
        ]}
        lignes={ventes.donnees}
        cle={(v) => v.id}
        chargement={ventes.chargement}
        erreur={ventes.erreur}
        onReessayer={ventes.recharger}
        onLigneClic={(v) => setDetail(v.id)}
        ligneSelectionnee={(v) => v.id === detail}
        parPage={25}
        filtreActif={recherche.trim().length > 0}
        resume={(n) =>
          `${n} vente${n > 1 ? 's' : ''} · ${montant(
            (ventes.donnees ?? []).filter((v) => v.statut === 'finalisee').reduce((s, v) => s + v.total, 0)
          )}`
        }
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
            Les ventes finalisées apparaîtront ici avec le détail des lots servis.
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
          formatDefaut={formatDefaut}
          onImprimer={(format) => reimprimer(detail, format)}
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
  formatDefaut,
  onImprimer,
  onAnnulee,
  peutAnnuler
}: {
  id: number
  onFermer: () => void
  formatDefaut: FormatImpression
  onImprimer: (format: FormatImpression) => void
  onAnnulee: () => void
  peutAnnuler: boolean
}) {
  const vente = useRequete<VenteDetail>('ventes.detail', { id })
  const action = useAction()
  const [motif, setMotif] = useState('')
  const [annulation, setAnnulation] = useState(false)
  const [format, setFormat] = useState<FormatImpression>(formatDefaut)

  async function annuler(): Promise<void> {
    const resultat = await action.executer('ventes.annuler', { id, motif: motif.trim() })
    if (resultat !== null) onAnnulee()
  }

  if (!vente.donnees) {
    return (
      <Modale titre="Détail de la vente" onFermer={onFermer}>
        <div className="panneau-corps">
          {vente.erreur ? <Bandeau ton="danger">{vente.erreur.message}</Bandeau> : <Chargement />}
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
            Le stock de {v.lignes.length} ligne(s) sera restitué dans les lots d’origine. La vente
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
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as FormatImpression)}
            aria-label="Format de réimpression"
            style={{
              height: 32,
              padding: '0 8px',
              border: '1px solid var(--bordure-nette)',
              borderRadius: 4,
              fontSize: 12.5
            }}
          >
            {FORMATS.map((f) => (
              <option key={f.valeur} value={f.valeur}>
                {f.libelle}
              </option>
            ))}
          </select>
          <Bouton icone="imprimer" onClick={() => onImprimer(format)}>
            Réimprimer
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
              Le stock a été restitué dans ses lots d’origine.
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
            <div className="formulaire-titre">Règlements</div>
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

/**
 * Rattacher un code-barres inconnu, sans quitter le comptoir.
 *
 * Une même référence arrive avec des codes différents selon l'importateur.
 * Renvoyer le pharmacien dans la fiche produit, lui faire coller le code, puis
 * lui demander de scanner à nouveau, c'est trois écrans avec un client qui
 * attend. Ici : on scanne, on désigne le produit, il entre au panier et le code
 * est retenu pour toujours.
 *
 * Le logiciel ne rapproche jamais deux références de lui-même. Dans une
 * officine, se tromper de produit, c'est mettre le mauvais médicament dans le
 * sachet : c'est le pharmacien qui décide, toujours.
 */
function RattacherCode({
  code,
  onRattache,
  onCreer,
  onFermer
}: {
  code: string
  onRattache: (produit: ProduitEtat) => void
  onCreer: () => void
  onFermer: () => void
}) {
  const action = useAction()
  const notifications = useNotifications()
  const [saisie, setSaisie] = useState('')
  const [surligne, setSurligne] = useState(0)
  const champ = useRef<HTMLInputElement>(null)
  const differee = useDifferee(saisie, 140)

  const resultats = useRequete<ProduitEtat[]>(
    'produits.rechercheRapide',
    { saisie: differee },
    differee.trim().length >= 2
  )
  const produits = resultats.donnees ?? []

  useEffect(() => {
    champ.current?.focus()
  }, [])
  useEffect(() => setSurligne(0), [differee])

  async function rattacher(produit: ProduitEtat): Promise<void> {
    const r = await action.executer('produits.rattacherCodeBarres', {
      produitId: produit.id,
      code
    })
    if (r === null) return

    notifications.succes(
      'Code-barres enregistré',
      `${code} désigne désormais ${produit.nom_commercial}.`
    )
    onRattache(produit)
  }

  function auClavier(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSurligne((i) => Math.min(i + 1, produits.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSurligne((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && produits[surligne]) {
      e.preventDefault()
      void rattacher(produits[surligne]!)
    } else if (e.key === 'Escape') {
      onFermer()
    }
  }

  return (
    <div className="rattachement">
      <div className="rattachement-entete">
        <div>
          <strong>Code-barres inconnu</strong>
          <span className="rattachement-code">{code}</span>
        </div>
        <Bouton compact onClick={onFermer}>
          Fermer
        </Bouton>
      </div>

      <p className="rattachement-question">À quel produit correspond cette boîte ?</p>

      <input
        ref={champ}
        className="rattachement-saisie"
        value={saisie}
        onChange={(e) => setSaisie(e.target.value)}
        onKeyDown={auClavier}
        placeholder="Tapez le nom du produit…"
        autoComplete="off"
      />

      {action.erreur ? <Bandeau ton="danger">{action.erreur.message}</Bandeau> : null}

      {produits.length > 0 ? (
        <div className="rattachement-liste">
          {produits.slice(0, 6).map((p, index) => (
            <button
              key={p.id}
              type="button"
              className={`rattachement-choix${index === surligne ? ' surligne' : ''}`}
              onMouseEnter={() => setSurligne(index)}
              onClick={() => void rattacher(p)}
            >
              <span className="rattachement-nom">
                {p.nom_commercial} {p.dosage ?? ''}
              </span>
              <span className="rattachement-detail">
                {p.code_interne} · {nombre(p.stock_disponible)} en stock
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="rattachement-pied">
        <span>Ce produit n’existe pas encore au catalogue ?</span>
        <Bouton compact icone="plus" onClick={onCreer}>
          Créer le produit avec ce code
        </Bouton>
      </div>
    </div>
  )
}

/**
 * Ce que le comptoir doit voir du produit sous le curseur.
 *
 * Le logiciel dont s'inspire cette fiche affichait ces informations en
 * permanence, dans des cadres vides la plupart du temps. Ici elles n'existent
 * que lorsqu'un produit est designe : l'ecran reste calme tant qu'on cherche,
 * et se remplit au moment de decider.
 *
 * Trois questions, dans l'ordre ou elles se posent reellement :
 *   ou est la boite — pour aller la chercher sans hesiter ;
 *   combien de temps tient-elle — pour ne pas servir une peremption proche a
 *     quelqu'un qui part en voyage ;
 *   par quoi la remplacer — parce qu'une rupture n'est pas une vente perdue
 *     quand la meme molecule existe sous un autre nom.
 */
interface ContexteProduit {
  emplacement: string | null
  joursAvantPeremption: number | null
  datePeremption: string | null
  lotsActifs: number
  equivalents: {
    id: number
    nom: string
    dosage: string | null
    forme: string | null
    prixVente: number
    stockDisponible: number
  }[]
}

function FicheComptoir({
  produit,
  onChoisir
}: {
  produit: ProduitEtat | null
  onChoisir: (id: number) => void
}): ReactNode {
  const contexte = useRequete<ContexteProduit>(
    'produits.contexte',
    produit ? { id: produit.id } : null,
    !!produit
  )

  if (!produit) {
    return (
      <section className="panneau fiche-comptoir vide">
        <p>Designez un produit pour voir son emplacement, sa peremption et ses equivalents.</p>
      </section>
    )
  }

  const c = contexte.donnees
  const jours = c?.joursAvantPeremption ?? null

  // Trois semaines : le delai en deca duquel on hesite a servir une boite a
  // quelqu'un qui ne reviendra pas avant longtemps.
  const tonPeremption = jours == null ? 'neutre' : jours < 0 ? 'danger' : jours <= 21 ? 'attention' : 'succes'

  return (
    <section className="panneau fiche-comptoir">
      <header>
        <strong>
          {produit.nom_commercial} {produit.dosage ?? ''}
        </strong>
        <span className="prix">{montant(produit.prix_vente)}</span>
      </header>

      <dl className="fiche-comptoir-faits">
        <div>
          <dt>Emplacement</dt>
          <dd>{c?.emplacement || <span className="absent">non renseigné</span>}</dd>
        </div>
        <div>
          <dt>Stock</dt>
          <dd>
            {nombre(produit.stock_disponible)}
            {c && c.lotsActifs > 1 ? <span className="detail"> · {c.lotsActifs} lots</span> : null}
          </dd>
        </div>
        <div>
          <dt>Péremption</dt>
          <dd className={`peremption ${tonPeremption}`}>
            {jours == null ? (
              <span className="absent">aucun lot daté</span>
            ) : jours < 0 ? (
              'lot expiré'
            ) : jours === 0 ? (
              'expire aujourd’hui'
            ) : jours <= 60 ? (
              `dans ${nombre(jours)} jour${jours > 1 ? 's' : ''}`
            ) : (
              `dans ${nombre(Math.round(jours / 30))} mois`
            )}
          </dd>
        </div>
      </dl>

      {c && c.equivalents.length ? (
        <div className="fiche-comptoir-equivalents">
          <span className="intitule">Même principe actif</span>
          <div className="equivalents-liste">
            {c.equivalents.map((e) => (
              <button
                key={e.id}
                type="button"
                className="equivalent"
                onClick={() => onChoisir(e.id)}
                title={`Ajouter ${e.nom} au panier`}
              >
                <span className="nom">
                  {e.nom} {e.dosage ?? ''}
                </span>
                <span className="chiffres">
                  {montant(e.prixVente)} · {nombre(e.stockDisponible)} en stock
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
