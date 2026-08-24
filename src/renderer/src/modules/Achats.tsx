import { Fragment, useEffect, useMemo, useState } from 'react'
import type { Achat, Fournisseur, ProduitEtat } from '@shared/types'
import { appeler } from '../lib/api'
import { useAction, useDifferee, useRequete } from '../lib/hooks'
import { useSession } from '../app/Session'
import type { Destination } from '../app/navigation'
import { useNotifications } from '../ui/Notifications'
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
  Liste,
  Modale,
  Segments,
  ZoneTexte
} from '../ui/Composants'
import Tableau, { CellulePrincipale } from '../ui/Tableau'
import { aujourdhui, dateCourte, modePaiement, montant, nombre } from '../lib/format'

interface LigneReceptionSaisie {
  produit: ProduitEtat
  quantite: number
  prixAchat: number
  numeroLot: string
  datePeremption: string
}

export default function Achats({ destination }: { destination: Destination }) {
  const session = useSession()
  const notifications = useNotifications()
  const [onglet, setOnglet] = useState<'liste' | 'suggestions'>('liste')
  const [reception, setReception] = useState(false)
  const [detail, setDetail] = useState<number | null>(null)
  const [impayes, setImpayes] = useState(false)

  useEffect(() => {
    if (destination.filtre === 'nouveau' && session.peut('achats.valider')) setReception(true)
    if (destination.cible?.type === 'achat') setDetail(destination.cible.id)
  }, [destination, session])

  const achats = useRequete<Achat[]>('achats.lister', { impayes: impayes || undefined, limite: 300 })

  return (
    <>
      <EntetePage
        titre="Achats"
        description="Réceptions fournisseurs, coûts d’acquisition et dettes en cours."
        actions={
          <>
            <Segments
              valeur={onglet}
              options={[
                { valeur: 'liste', libelle: 'Réceptions' },
                { valeur: 'suggestions', libelle: 'À commander' }
              ]}
              onChange={setOnglet}
            />
            {session.peut('achats.valider') ? (
              <Bouton variante="principal" icone="plus" onClick={() => setReception(true)}>
                Enregistrer une réception
              </Bouton>
            ) : null}
          </>
        }
      />

      {onglet === 'suggestions' ? (
        <Suggestions onCommander={() => setReception(true)} />
      ) : (
        <Tableau
          colonnes={[
            {
              cle: 'reference',
              entete: 'Référence',
              largeur: '140px',
              rendu: (a: Achat) => <CellulePrincipale titre={a.reference} sous={dateCourte(a.date_reception)} />,
              triSur: (a: Achat) => a.date_reception ?? ''
            },
            {
              cle: 'fournisseur',
              entete: 'Fournisseur',
              rendu: (a: Achat) => a.fournisseur ?? '—',
              triSur: (a: Achat) => a.fournisseur ?? ''
            },
            {
              cle: 'lignes',
              entete: 'Lignes',
              nombre: true,
              rendu: (a: Achat) => nombre(a.nb_lignes ?? 0)
            },
            {
              cle: 'total',
              entete: 'Total',
              nombre: true,
              rendu: (a: Achat) => <strong>{montant(a.total)}</strong>,
              triSur: (a: Achat) => a.total
            },
            {
              cle: 'paye',
              entete: 'Payé',
              nombre: true,
              rendu: (a: Achat) => montant(a.montant_paye),
              triSur: (a: Achat) => a.montant_paye
            },
            {
              cle: 'reste',
              entete: 'Reste dû',
              nombre: true,
              rendu: (a: Achat) =>
                a.total - a.montant_paye > 0 ? (
                  <strong style={{ color: 'var(--attention)' }}>{montant(a.total - a.montant_paye)}</strong>
                ) : (
                  <span style={{ color: 'var(--texte-faible)' }}>—</span>
                ),
              triSur: (a: Achat) => a.total - a.montant_paye
            },
            {
              cle: 'statut',
              entete: 'Statut',
              largeur: '120px',
              rendu: (a: Achat) =>
                a.montant_paye >= a.total ? (
                  <Etiquette ton="succes">Soldé</Etiquette>
                ) : a.montant_paye > 0 ? (
                  <Etiquette ton="attention">Partiel</Etiquette>
                ) : (
                  <Etiquette ton="danger">Impayé</Etiquette>
                )
            }
          ]}
          lignes={achats.donnees}
          cle={(a) => a.id}
          chargement={achats.chargement}
          erreur={achats.erreur}
          onReessayer={achats.recharger}
          onLigneClic={(a) => setDetail(a.id)}
          parPage={25}
          filtreActif={impayes}
          resume={(n) => `${n} réception${n > 1 ? 's' : ''}`}
          outils={
            <Segments
              valeur={impayes ? 'impayes' : 'tous'}
              options={[
                { valeur: 'tous', libelle: 'Toutes' },
                { valeur: 'impayes', libelle: 'Restant dû' }
              ]}
              onChange={(v) => setImpayes(v === 'impayes')}
            />
          }
          vide={
            <EtatVide
              icone="achat"
              titre="Aucune réception enregistrée"
              action={
                session.peut('achats.valider') ? (
                  <Bouton variante="principal" icone="plus" onClick={() => setReception(true)}>
                    Enregistrer une réception
                  </Bouton>
                ) : undefined
              }
            >
              Une réception crée les lots, met le stock à jour et enregistre la dette fournisseur.
            </EtatVide>
          }
          videApresFiltre={
            <EtatVide icone="coche" titre="Aucune dette fournisseur">
              Toutes vos réceptions sont soldées.
            </EtatVide>
          }
        />
      )}

      {reception ? (
        <FormulaireReception
          onFermer={() => setReception(false)}
          onEnregistre={(reference) => {
            setReception(false)
            achats.recharger()
            notifications.succes('Réception enregistrée', `${reference} — stock et lots mis à jour.`)
          }}
        />
      ) : null}

      {detail !== null ? (
        <DetailAchat
          id={detail}
          onFermer={() => setDetail(null)}
          onPaye={() => {
            achats.recharger()
            notifications.succes('Paiement enregistré')
          }}
        />
      ) : null}
    </>
  )
}

// ===========================================================================
// Suggestions de réapprovisionnement
// ===========================================================================

function Suggestions({ onCommander }: { onCommander: () => void }) {
  const suggestions = useRequete<
    {
      produit_id: number
      nom_commercial: string
      stock_disponible: number
      stock_min: number
      a_commander: number
      fournisseur: string | null
      dernier_prix: number
    }[]
  >('stock.suggestions')

  return (
    <Tableau
      colonnes={[
        {
          cle: 'produit',
          entete: 'Produit',
          rendu: (s) => (
            <CellulePrincipale
              titre={s.nom_commercial}
              sous={s.fournisseur ? `Dernier fournisseur : ${s.fournisseur}` : 'Aucun fournisseur connu'}
            />
          ),
          triSur: (s) => s.nom_commercial
        },
        {
          cle: 'stock',
          entete: 'Disponible',
          nombre: true,
          rendu: (s) => (
            <span style={{ color: s.stock_disponible === 0 ? 'var(--danger)' : undefined }}>
              {nombre(s.stock_disponible)}
            </span>
          ),
          triSur: (s) => s.stock_disponible
        },
        { cle: 'min', entete: 'Seuil', nombre: true, rendu: (s) => nombre(s.stock_min) },
        {
          cle: 'commander',
          entete: 'À commander',
          nombre: true,
          rendu: (s) => <strong>{nombre(s.a_commander)}</strong>,
          triSur: (s) => s.a_commander
        },
        {
          cle: 'cout',
          entete: 'Coût estimé',
          nombre: true,
          rendu: (s) => montant(s.a_commander * s.dernier_prix),
          triSur: (s) => s.a_commander * s.dernier_prix
        }
      ]}
      lignes={suggestions.donnees}
      cle={(s) => s.produit_id}
      chargement={suggestions.chargement}
      erreur={suggestions.erreur}
      onReessayer={suggestions.recharger}
      parPage={30}
      resume={(n) =>
        `${n} produit${n > 1 ? 's' : ''} à réapprovisionner · ${montant(
          (suggestions.donnees ?? []).reduce((t, s) => t + s.a_commander * s.dernier_prix, 0)
        )} estimés`
      }
      outils={
        <Bouton icone="achat" onClick={onCommander}>
          Enregistrer une réception
        </Bouton>
      }
      vide={
        <EtatVide icone="coche" titre="Aucun réapprovisionnement nécessaire">
          Tous vos produits sont au-dessus de leur seuil minimum.
        </EtatVide>
      }
    />
  )
}

// ===========================================================================
// Formulaire de réception
// ===========================================================================

function FormulaireReception({
  onFermer,
  onEnregistre
}: {
  onFermer: () => void
  onEnregistre: (reference: string) => void
}) {
  const action = useAction()
  const [fournisseurId, setFournisseurId] = useState<number | null>(null)
  const [lignes, setLignes] = useState<LigneReceptionSaisie[]>([])
  const [recherche, setRecherche] = useState('')
  const [date, setDate] = useState(aujourdhui())
  const [montantPaye, setMontantPaye] = useState(0)
  const [mode, setMode] = useState<'especes' | 'mobile_money' | 'carte' | 'virement' | 'cheque'>('virement')
  const [note, setNote] = useState('')

  const differee = useDifferee(recherche, 200)
  const fournisseurs = useRequete<Fournisseur[]>('fournisseurs.lister', {})
  const [resultats, setResultats] = useState<ProduitEtat[]>([])

  useEffect(() => {
    if (differee.trim().length < 2) {
      setResultats([])
      return
    }
    let annule = false
    appeler<ProduitEtat[]>('produits.rechercheRapide', { saisie: differee })
      .then((r) => !annule && setResultats(r))
      .catch(() => !annule && setResultats([]))
    return () => {
      annule = true
    }
  }, [differee])

  const total = useMemo(() => lignes.reduce((s, l) => s + l.quantite * l.prixAchat, 0), [lignes])

  function ajouter(produit: ProduitEtat): void {
    if (lignes.some((l) => l.produit.id === produit.id)) return
    setLignes((precedent) => [
      ...precedent,
      {
        produit,
        quantite: 1,
        prixAchat: produit.prix_achat,
        numeroLot: '',
        datePeremption: ''
      }
    ])
    setRecherche('')
  }

  function modifier(index: number, champs: Partial<LigneReceptionSaisie>): void {
    setLignes((precedent) => precedent.map((l, i) => (i === index ? { ...l, ...champs } : l)))
  }

  const valide = fournisseurId !== null && lignes.length > 0 && lignes.every((l) => l.quantite > 0)

  async function enregistrer(): Promise<void> {
    const resultat = await action.executer<Achat>('achats.reception', {
      fournisseurId,
      dateReception: date,
      montantPaye,
      modePaiement: mode,
      note: note.trim() || null,
      lignes: lignes.map((l) => ({
        produitId: l.produit.id,
        quantite: l.quantite,
        prixAchat: l.prixAchat,
        numeroLot: l.numeroLot.trim() || null,
        datePeremption: l.datePeremption || null
      }))
    })
    if (resultat) onEnregistre(resultat.reference)
  }

  return (
    <Modale
      titre="Enregistrer une réception"
      description="Les lots sont créés, le stock mis à jour et la dette fournisseur enregistrée."
      large
      onFermer={onFermer}
      pied={
        <>
          <span className="a-gauche" style={{ fontSize: 13 }}>
            Total : <strong style={{ fontSize: 16, color: 'var(--accent-fonce)' }}>{montant(total)}</strong>
          </span>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="principal" disabled={!valide} enCours={action.enCours} onClick={enregistrer}>
            Valider la réception
          </Bouton>
        </>
      }
    >
      {action.erreur ? (
        <div style={{ padding: '12px 14px 0' }}>
          <Bandeau ton="danger">{action.erreur.message}</Bandeau>
        </div>
      ) : null}

      <div className="formulaire-section">
        <div className="grille deux">
          <Liste
            libelle="Fournisseur"
            obligatoire
            vide="Choisir un fournisseur…"
            options={(fournisseurs.donnees ?? []).map((f) => ({ valeur: f.id, libelle: f.nom }))}
            value={fournisseurId ?? ''}
            onChange={(e) => setFournisseurId(e.target.value ? Number(e.target.value) : null)}
          />
          <Champ
            libelle="Date de réception"
            type="date"
            max={aujourdhui()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      <div className="formulaire-section">
        <div className="formulaire-titre">Produits reçus</div>

        <div className="recherche-champ" style={{ width: '100%', height: 36, marginBottom: 12 }}>
          <Icone nom="recherche" taille={14} />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un produit à ajouter…"
          />
        </div>

        {resultats.length > 0 ? (
          <div className="panneau" style={{ marginBottom: 12, maxHeight: 190, overflowY: 'auto' }}>
            {resultats.map((p) => (
              <button
                key={p.id}
                className="produit-ligne"
                disabled={lignes.some((l) => l.produit.id === p.id)}
                onClick={() => ajouter(p)}
              >
                <span className="nom">
                  <strong>
                    {p.nom_commercial} {p.dosage ?? ''}
                  </strong>
                  <span>
                    {nombre(p.stock_disponible)} en stock · dernier prix d’achat {montant(p.prix_achat)}
                  </span>
                </span>
                <Icone nom="plus" taille={15} />
              </button>
            ))}
          </div>
        ) : null}

        {lignes.length === 0 ? (
          <EtatVide icone="achat" titre="Aucun produit ajouté">
            Recherchez les produits livrés, puis saisissez quantité, prix, numéro de lot et date de
            péremption.
          </EtatVide>
        ) : (
          <div className="tableau-defilement">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th style={{ width: 90 }}>Quantité</th>
                  <th style={{ width: 130 }}>Prix d’achat</th>
                  <th style={{ width: 130 }}>N° de lot</th>
                  <th style={{ width: 150 }}>Péremption</th>
                  <th className="cellule-nombre" style={{ width: 110 }}>
                    Montant
                  </th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, index) => (
                  <tr key={l.produit.id}>
                    <td>
                      <CellulePrincipale
                        titre={`${l.produit.nom_commercial} ${l.produit.dosage ?? ''}`}
                        sous={l.produit.code_interne}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        value={l.quantite}
                        onChange={(e) => modifier(index, { quantite: Number(e.target.value) })}
                        style={{ width: '100%', height: 28, padding: '0 6px', border: '1px solid var(--bordure-nette)', borderRadius: 4 }}
                      />
                    </td>
                    <td>
                      <input
                        inputMode="decimal"
                        value={montant(l.prixAchat, false)}
                        onChange={(e) =>
                          modifier(index, { prixAchat: Number(e.target.value.replace(/\s/g, '').replace(',', '.')) || 0 })
                        }
                        style={{ width: '100%', height: 28, padding: '0 6px', textAlign: 'right', border: '1px solid var(--bordure-nette)', borderRadius: 4 }}
                      />
                    </td>
                    <td>
                      <input
                        value={l.numeroLot}
                        onChange={(e) => modifier(index, { numeroLot: e.target.value })}
                        placeholder="LOT-…"
                        style={{ width: '100%', height: 28, padding: '0 6px', border: '1px solid var(--bordure-nette)', borderRadius: 4 }}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        value={l.datePeremption}
                        min={aujourdhui()}
                        onChange={(e) => modifier(index, { datePeremption: e.target.value })}
                        style={{ width: '100%', height: 28, padding: '0 6px', border: '1px solid var(--bordure-nette)', borderRadius: 4 }}
                      />
                    </td>
                    <td className="cellule-nombre">
                      <strong>{montant(l.quantite * l.prixAchat)}</strong>
                    </td>
                    <td>
                      <BoutonIcone
                        icone="croix"
                        titre="Retirer cette ligne"
                        onClick={() => setLignes((p) => p.filter((_, i) => i !== index))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="formulaire-section">
        <div className="formulaire-titre">Règlement</div>
        <div className="grille deux">
          <ChampMontant
            libelle="Montant payé à la réception"
            valeur={montantPaye}
            onChangeValeur={setMontantPaye}
            aide={
              montantPaye < total
                ? `Reste dû : ${montant(total - montantPaye)}`
                : 'Réception intégralement réglée.'
            }
          />
          <Liste
            libelle="Mode de règlement"
            options={[
              { valeur: 'virement', libelle: 'Virement' },
              { valeur: 'especes', libelle: 'Espèces' },
              { valeur: 'cheque', libelle: 'Chèque' },
              { valeur: 'mobile_money', libelle: 'Mobile Money' },
              { valeur: 'carte', libelle: 'Carte' }
            ]}
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          />
          <ZoneTexte
            libelle="Note"
            large
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Numéro de bon de livraison, observations…"
          />
        </div>
      </div>
    </Modale>
  )
}

// ===========================================================================
// Détail
// ===========================================================================

function DetailAchat({ id, onFermer, onPaye }: { id: number; onFermer: () => void; onPaye: () => void }) {
  const session = useSession()
  const achat = useRequete<
    Achat & {
      lignes: {
        id: number
        nom_commercial: string
        quantite: number
        prix_achat: number
        numero_lot: string | null
        date_peremption: string | null
        montant: number
      }[]
      paiements: { at: string; montant: number; mode: string; reference: string | null }[]
    }
  >('achats.detail', { id })

  const action = useAction()
  const [paiement, setPaiement] = useState(false)
  const [somme, setSomme] = useState(0)
  const [mode, setMode] = useState<'especes' | 'mobile_money' | 'carte' | 'virement' | 'cheque'>('virement')

  if (!achat.donnees) {
    return (
      <Modale titre="Détail de la réception" onFermer={onFermer}>
        <div className="panneau-corps">
          {achat.erreur ? <Bandeau ton="danger">{achat.erreur.message}</Bandeau> : <Chargement />}
        </div>
      </Modale>
    )
  }

  const a = achat.donnees
  const reste = a.total - a.montant_paye

  async function payer(): Promise<void> {
    const r = await action.executer('achats.payer', { id, montant: somme, mode, reference: null })
    if (r !== null) {
      setPaiement(false)
      achat.recharger()
      onPaye()
    }
  }

  if (paiement) {
    return (
      <Modale
        titre="Paiement fournisseur"
        description={`${a.reference} — reste dû ${montant(reste)}`}
        onFermer={() => setPaiement(false)}
        pied={
          <>
            <Bouton onClick={() => setPaiement(false)}>Annuler</Bouton>
            <Bouton
              variante="principal"
              disabled={somme <= 0 || somme > reste}
              enCours={action.enCours}
              onClick={payer}
            >
              Enregistrer le paiement
            </Bouton>
          </>
        }
      >
        <div className="panneau-corps pile">
          {action.erreur ? <Bandeau ton="danger">{action.erreur.message}</Bandeau> : null}
          <ChampMontant
            libelle="Montant réglé"
            obligatoire
            valeur={somme}
            onChangeValeur={setSomme}
            erreur={somme > reste ? `Le paiement dépasse le reste dû (${montant(reste)}).` : undefined}
          />
          <Bouton compact onClick={() => setSomme(reste)}>
            Solder la totalité
          </Bouton>
          <Liste
            libelle="Mode de règlement"
            options={[
              { valeur: 'virement', libelle: 'Virement' },
              { valeur: 'especes', libelle: 'Espèces' },
              { valeur: 'cheque', libelle: 'Chèque' },
              { valeur: 'mobile_money', libelle: 'Mobile Money' },
              { valeur: 'carte', libelle: 'Carte' }
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
      titre={`Réception ${a.reference}`}
      description={`${a.fournisseur} · ${dateCourte(a.date_reception)}`}
      large
      onFermer={onFermer}
      pied={
        <>
          {reste > 0 && session.peut('achats.payer') ? (
            <Bouton
              className="a-gauche"
              variante="principal"
              icone="caisse"
              onClick={() => {
                setSomme(reste)
                setPaiement(true)
              }}
            >
              Régler {montant(reste)}
            </Bouton>
          ) : null}
          <Bouton onClick={onFermer}>Fermer</Bouton>
        </>
      }
    >
      <div className="panneau-corps">
        <table className="tableau">
          <thead>
            <tr>
              <th>Produit</th>
              <th>Lot</th>
              <th>Péremption</th>
              <th className="cellule-nombre">Quantité</th>
              <th className="cellule-nombre">Prix unitaire</th>
              <th className="cellule-nombre">Montant</th>
            </tr>
          </thead>
          <tbody>
            {a.lignes.map((l) => (
              <tr key={l.id}>
                <td>{l.nom_commercial}</td>
                <td style={{ color: 'var(--texte-faible)' }}>{l.numero_lot ?? '—'}</td>
                <td>{dateCourte(l.date_peremption)}</td>
                <td className="cellule-nombre">{nombre(l.quantite)}</td>
                <td className="cellule-nombre">{montant(l.prix_achat)}</td>
                <td className="cellule-nombre">{montant(l.montant)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <div className="formulaire-titre">Règlements</div>
            {a.paiements.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--texte-faible)' }}>Aucun règlement enregistré.</p>
            ) : (
              <dl className="liste-definitions">
                {a.paiements.map((p, i) => (
                  <Fragment key={i}>
                    <dt>
                      {dateCourte(p.at)} — {modePaiement(p.mode)}
                    </dt>
                    <dd>{montant(p.montant)}</dd>
                  </Fragment>
                ))}
              </dl>
            )}
          </div>
          <div>
            <div className="formulaire-titre">Totaux</div>
            <dl className="liste-definitions">
              <dt>Sous-total</dt>
              <dd>{montant(a.sous_total)}</dd>
              {a.remise > 0 ? (
                <>
                  <dt>Remise</dt>
                  <dd>− {montant(a.remise)}</dd>
                </>
              ) : null}
              {a.frais > 0 ? (
                <>
                  <dt>Frais</dt>
                  <dd>{montant(a.frais)}</dd>
                </>
              ) : null}
              <dt>Total</dt>
              <dd style={{ fontWeight: 700 }}>{montant(a.total)}</dd>
              <dt>Payé</dt>
              <dd>{montant(a.montant_paye)}</dd>
              <dt>Reste dû</dt>
              <dd style={{ color: reste > 0 ? 'var(--attention)' : 'var(--succes)', fontWeight: 600 }}>
                {montant(reste)}
              </dd>
            </dl>
          </div>
        </div>

        {a.note ? (
          <div style={{ marginTop: 16 }}>
            <div className="formulaire-titre">Note</div>
            <p style={{ fontSize: 12.5, color: 'var(--texte-attenue)' }}>{a.note}</p>
          </div>
        ) : null}
      </div>
    </Modale>
  )
}
