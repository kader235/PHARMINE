import { useEffect, useState } from 'react'
import type { Lot, MouvementStock, Page, ProduitEtat } from '@shared/types'
import { useAction, useDifferee, useRequete } from '../lib/hooks'
import { useSession } from '../app/Session'
import { useFonctions } from '../app/fonctions'
import { useNavigation, type Destination } from '../app/navigation'
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
  Indicateur,
  Liste,
  Modale,
  Segments,
  ZoneTexte
} from '../ui/Composants'
import Tableau, { CellulePrincipale, RechercheTableau } from '../ui/Tableau'
import { dateCourte, depuis, etatStock, montant, nombre, typeMouvement } from '../lib/format'

type Filtre = 'tous' | 'rupture' | 'faible' | 'disponible' | 'surstock'

export default function Stock({ destination }: { destination: Destination }) {
  const session = useSession()
  const naviguer = useNavigation()
  const notifications = useNotifications()

  const [onglet, setOnglet] = useState<'etat' | 'mouvements'>('etat')
  const [filtre, setFiltre] = useState<Filtre>('tous')
  const [recherche, setRecherche] = useState('')
  const [operation, setOperation] = useState<{ type: 'entree' | 'sortie'; produit: ProduitEtat } | null>(null)
  const [lotsDe, setLotsDe] = useState<ProduitEtat | null>(null)

  const differee = useDifferee(recherche, 200)

  useEffect(() => {
    if (destination.filtre === 'rupture' || destination.filtre === 'faible') {
      setFiltre(destination.filtre)
    }
  }, [destination])

  const liste = useRequete<Page<ProduitEtat>>('produits.lister', {
    recherche: differee.trim() || undefined,
    etat: filtre === 'tous' ? undefined : filtre,
    parPage: 500
  })

  const total = useRequete<Page<ProduitEtat>>('produits.lister', { parPage: 500 })

  useFonctions('stock', [
    {
      touche: 'F5',
      libelle: 'Actualiser',
      action: () => {
        liste.recharger()
        total.recharger()
      }
    },
    {
      touche: 'F7',
      libelle: 'Ruptures',
      action: () => setFiltre((f) => (f === 'rupture' ? 'tous' : 'rupture'))
    },
    {
      touche: 'F8',
      libelle: 'Stock faible',
      action: () => setFiltre((f) => (f === 'faible' ? 'tous' : 'faible'))
    },
    {
      touche: 'F9',
      libelle: 'Mouvements',
      action: () => setOnglet((o) => (o === 'mouvements' ? 'etat' : 'mouvements'))
    }
  ])

  const produits = total.donnees?.lignes ?? []
  const valeur = produits.reduce((s, p) => s + p.valeur_achat, 0)
  const ruptures = produits.filter((p) => p.etat_stock === 'rupture').length
  const faibles = produits.filter((p) => p.etat_stock === 'faible').length

  function rafraichir(): void {
    liste.recharger()
    total.recharger()
  }

  return (
    <>
      <EntetePage
        titre="État du stock"
        actions={
          <Segments
            valeur={onglet}
            options={[
              { valeur: 'etat', libelle: 'Par produit' },
              { valeur: 'mouvements', libelle: 'Mouvements' }
            ]}
            onChange={setOnglet}
          />
        }
      />

      {onglet === 'etat' ? (
        <>
          <div className="indicateurs">
            <Indicateur
              libelle="Références suivies"
              valeur={nombre(produits.length)}
              detail={<span>Produits actifs au catalogue</span>}
            />
            <Indicateur
              libelle="Valeur du stock"
              valeur={montant(valeur)}
              detail={<span>Au prix d’achat des lots</span>}
            />
            <Indicateur
              libelle="Stock faible"
              valeur={nombre(faibles)}
              ton={faibles > 0 ? 'danger' : undefined}
              detail={<span>Sous le seuil minimum</span>}
            />
            <Indicateur
              libelle="Ruptures"
              valeur={nombre(ruptures)}
              ton={ruptures > 0 ? 'danger' : undefined}
              detail={<span>Action requise aujourd’hui</span>}
            />
          </div>

          <Tableau
            colonnes={[
              {
                cle: 'nom',
                entete: 'Produit',
                triSur: (p: ProduitEtat) => p.nom_commercial,
                rendu: (p: ProduitEtat) => (
                  <CellulePrincipale
                    titre={`${p.nom_commercial} ${p.dosage ?? ''}`}
                    sous={[p.categorie, p.emplacement].filter(Boolean).join(' · ')}
                  />
                )
              },
              {
                cle: 'stock',
                entete: 'Disponible',
                nombre: true,
                rendu: (p: ProduitEtat) => <strong>{nombre(p.stock_disponible)}</strong>,
                triSur: (p: ProduitEtat) => p.stock_disponible
              },
              {
                cle: 'min',
                entete: 'Seuil',
                nombre: true,
                rendu: (p: ProduitEtat) => nombre(p.stock_min),
                triSur: (p: ProduitEtat) => p.stock_min
              },
              {
                cle: 'lots',
                entete: 'Lots',
                nombre: true,
                rendu: (p: ProduitEtat) => nombre(p.lots_actifs),
                triSur: (p: ProduitEtat) => p.lots_actifs
              },
              {
                cle: 'peremption',
                entete: 'Prochaine péremption',
                rendu: (p: ProduitEtat) => dateCourte(p.prochaine_peremption),
                triSur: (p: ProduitEtat) => p.prochaine_peremption
              },
              {
                cle: 'valeur',
                entete: 'Valeur',
                nombre: true,
                rendu: (p: ProduitEtat) => montant(p.valeur_achat),
                triSur: (p: ProduitEtat) => p.valeur_achat
              },
              {
                cle: 'etat',
                entete: 'État',
                largeur: '130px',
                rendu: (p: ProduitEtat) => {
                  const e = etatStock(p.etat_stock)
                  return <Etiquette ton={e.ton}>{e.libelle}</Etiquette>
                },
                triSur: (p: ProduitEtat) => p.etat_stock
              },
              {
                cle: 'actions',
                entete: '',
                actions: true,
                largeur: '190px',
                rendu: (p: ProduitEtat) => (
                  <div className="rangee" style={{ justifyContent: 'flex-end', gap: 4 }}>
                    <Bouton compact variante="discret" onClick={() => setLotsDe(p)}>
                      Lots
                    </Bouton>
                    {session.peut('stock.entree') ? (
                      <Bouton compact variante="discret" onClick={() => setOperation({ type: 'entree', produit: p })}>
                        Entrée
                      </Bouton>
                    ) : null}
                    {session.peut('stock.sortie') ? (
                      <Bouton
                        compact
                        variante="discret"
                        disabled={p.stock_disponible <= 0}
                        onClick={() => setOperation({ type: 'sortie', produit: p })}
                      >
                        Sortie
                      </Bouton>
                    ) : null}
                  </div>
                )
              }
            ]}
            lignes={liste.donnees?.lignes ?? null}
            cle={(p) => p.id}
            chargement={liste.chargement}
            erreur={liste.erreur}
            onReessayer={liste.recharger}
            parPage={30}
            filtreActif={filtre !== 'tous' || differee.trim().length > 0}
            resume={(n) => `${n} référence${n > 1 ? 's' : ''}`}
            outils={
              <>
                <RechercheTableau valeur={recherche} onChange={setRecherche} placeholder="Rechercher un produit…" />
                <Segments
                  valeur={filtre}
                  options={[
                    { valeur: 'tous', libelle: 'Tous' },
                    { valeur: 'rupture', libelle: `Ruptures${ruptures ? ` (${ruptures})` : ''}` },
                    { valeur: 'faible', libelle: `Faible${faibles ? ` (${faibles})` : ''}` },
                    { valeur: 'disponible', libelle: 'Disponibles' },
                    { valeur: 'surstock', libelle: 'Surstock' }
                  ]}
                  onChange={setFiltre}
                />
              </>
            }
            vide={
              <EtatVide
                icone="stock"
                titre={filtre === 'tous' ? 'Aucun produit au catalogue' : 'Aucun produit dans cet état'}
                action={
                  filtre === 'tous' ? (
                    <Bouton onClick={() => naviguer({ module: 'produits', filtre: 'nouveau' })}>
                      Ajouter un produit
                    </Bouton>
                  ) : undefined
                }
              >
                {filtre === 'rupture'
                  ? 'Aucune rupture en cours : tous vos produits ont du stock disponible.'
                  : filtre === 'faible'
                    ? 'Aucun produit sous son seuil minimum.'
                    : 'Le stock se remplira dès votre première réception.'}
              </EtatVide>
            }
            videApresFiltre={
              <EtatVide icone="recherche" titre="Aucun produit ne correspond">
                Modifiez la recherche ou changez de filtre.
              </EtatVide>
            }
          />
        </>
      ) : (
        <Mouvements />
      )}

      {operation ? (
        <OperationStock
          type={operation.type}
          produit={operation.produit}
          onFermer={() => setOperation(null)}
          onEnregistre={() => {
            setOperation(null)
            rafraichir()
            notifications.succes(operation.type === 'entree' ? 'Entrée enregistrée' : 'Sortie enregistrée')
          }}
        />
      ) : null}

      {lotsDe ? (
        <LotsProduit produit={lotsDe} onFermer={() => setLotsDe(null)} onChange={rafraichir} />
      ) : null}
    </>
  )
}

function Mouvements() {
  const [type, setType] = useState<string>('tous')
  const mouvements = useRequete<MouvementStock[]>('stock.mouvements', {
    type: type === 'tous' ? undefined : type,
    limite: 400
  })

  return (
    <Tableau
      colonnes={[
        { cle: 'at', entete: 'Date', largeur: '130px', rendu: (m) => depuis(m.at), triSur: (m) => m.at },
        {
          cle: 'produit',
          entete: 'Produit',
          rendu: (m) => <CellulePrincipale titre={m.nom_commercial ?? '—'} sous={m.numero_lot ?? undefined} />
        },
        { cle: 'type', entete: 'Opération', largeur: '150px', rendu: (m) => typeMouvement(m.type) },
        {
          cle: 'quantite',
          entete: 'Quantité',
          nombre: true,
          rendu: (m) => (
            <strong style={{ color: m.quantite < 0 ? 'var(--danger)' : 'var(--succes)' }}>
              {m.quantite > 0 ? '+' : ''}
              {nombre(m.quantite)}
            </strong>
          ),
          triSur: (m) => m.quantite
        },
        { cle: 'apres', entete: 'Stock après', nombre: true, rendu: (m) => nombre(m.stock_apres) },
        {
          cle: 'motif',
          entete: 'Motif',
          rendu: (m) => <span style={{ color: 'var(--texte-attenue)' }}>{m.motif ?? '—'}</span>
        },
        { cle: 'utilisateur', entete: 'Par', largeur: '140px', rendu: (m) => m.utilisateur ?? '—' }
      ]}
      lignes={mouvements.donnees}
      cle={(m) => m.id}
      chargement={mouvements.chargement}
      erreur={mouvements.erreur}
      onReessayer={mouvements.recharger}
      parPage={30}
      filtreActif={type !== 'tous'}
      resume={(n) => `${n} mouvement${n > 1 ? 's' : ''}`}
      outils={
        <Segments
          valeur={type}
          options={[
            { valeur: 'tous', libelle: 'Tous' },
            { valeur: 'entree', libelle: 'Entrées' },
            { valeur: 'vente', libelle: 'Ventes' },
            { valeur: 'ajustement', libelle: 'Ajustements' },
            { valeur: 'inventaire', libelle: 'Inventaires' },
            { valeur: 'perte', libelle: 'Pertes' }
          ]}
          onChange={setType}
        />
      }
      vide={
        <EtatVide icone="journal" titre="Aucun mouvement enregistré">
          Chaque entrée, vente, ajustement ou perte laissera une trace ici.
        </EtatVide>
      }
      videApresFiltre={
        <EtatVide icone="filtre" titre="Aucun mouvement de ce type">
          Choisissez un autre type d’opération.
        </EtatVide>
      }
    />
  )
}

function OperationStock({
  type,
  produit,
  onFermer,
  onEnregistre
}: {
  type: 'entree' | 'sortie'
  produit: ProduitEtat
  onFermer: () => void
  onEnregistre: () => void
}) {
  const action = useAction()
  const [quantite, setQuantite] = useState(1)
  const [prixAchat, setPrixAchat] = useState(produit.prix_achat)
  const [numeroLot, setNumeroLot] = useState('')
  const [peremption, setPeremption] = useState('')
  const [motif, setMotif] = useState('')
  const [nature, setNature] = useState<'perte' | 'peremption' | 'sortie' | 'retour_fournisseur'>('perte')

  async function enregistrer(): Promise<void> {
    const resultat =
      type === 'entree'
        ? await action.executer('stock.entree', {
            produitId: produit.id,
            quantite,
            prixAchat,
            numeroLot: numeroLot.trim() || null,
            datePeremption: peremption || null,
            motif: motif.trim() || 'Entrée manuelle'
          })
        : await action.executer('stock.sortie', {
            produitId: produit.id,
            quantite,
            type: nature,
            motif: motif.trim()
          })

    if (resultat !== null) onEnregistre()
  }

  const valide =
    quantite > 0 &&
    (type === 'entree' ? true : motif.trim().length >= 3 && quantite <= produit.stock_disponible)

  return (
    <Modale
      titre={type === 'entree' ? 'Entrée de stock' : 'Sortie de stock'}
      description={`${produit.nom_commercial} ${produit.dosage ?? ''} — ${nombre(produit.stock_disponible)} disponible(s)`}
      onFermer={onFermer}
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton
            variante={type === 'sortie' ? 'danger' : 'principal'}
            disabled={!valide}
            enCours={action.enCours}
            onClick={enregistrer}
          >
            {type === 'entree' ? 'Enregistrer l’entrée' : 'Enregistrer la sortie'}
          </Bouton>
        </>
      }
    >
      <div className="panneau-corps pile">
        {action.erreur ? <Bandeau ton="danger">{action.erreur.message}</Bandeau> : null}

        {type === 'entree' ? (
          <Bandeau ton="info">
            Cette entrée crée un nouveau lot. Pour une livraison fournisseur, préférez le module
            Achats : la dette et le coût y sont également enregistrés.
          </Bandeau>
        ) : null}

        <Champ
          libelle="Quantité"
          obligatoire
          type="number"
          min={1}
          max={type === 'sortie' ? produit.stock_disponible : undefined}
          value={quantite}
          onChange={(e) => setQuantite(Number(e.target.value))}
          erreur={
            type === 'sortie' && quantite > produit.stock_disponible
              ? `Le stock disponible est de ${nombre(produit.stock_disponible)}.`
              : undefined
          }
        />

        {type === 'entree' ? (
          <>
            <ChampMontant libelle="Prix d’achat unitaire" valeur={prixAchat} onChangeValeur={setPrixAchat} />
            <div className="grille deux">
              <Champ
                libelle="Numéro de lot"
                value={numeroLot}
                onChange={(e) => setNumeroLot(e.target.value)}
                aide="Facultatif si le produit n’est pas suivi par lot."
              />
              <Champ
                libelle="Date de péremption"
                type="date"
                value={peremption}
                onChange={(e) => setPeremption(e.target.value)}
              />
            </div>
          </>
        ) : (
          <Liste
            libelle="Nature de la sortie"
            options={[
              { valeur: 'perte', libelle: 'Perte ou casse' },
              { valeur: 'peremption', libelle: 'Retrait pour péremption' },
              { valeur: 'retour_fournisseur', libelle: 'Retour au fournisseur' },
              { valeur: 'sortie', libelle: 'Autre sortie' }
            ]}
            value={nature}
            onChange={(e) => setNature(e.target.value as typeof nature)}
          />
        )}

        <ZoneTexte
          libelle="Motif"
          obligatoire={type === 'sortie'}
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          placeholder={
            type === 'entree' ? 'Don, régularisation, transfert…' : 'Flacon cassé, lot rappelé, dégât des eaux…'
          }
        />
      </div>
    </Modale>
  )
}

function LotsProduit({
  produit,
  onFermer,
  onChange
}: {
  produit: ProduitEtat
  onFermer: () => void
  onChange: () => void
}) {
  const session = useSession()
  const notifications = useNotifications()
  const action = useAction()
  const lots = useRequete<Lot[]>('stock.lots', { produitId: produit.id })
  const [ajustement, setAjustement] = useState<Lot | null>(null)
  const [quantite, setQuantite] = useState(0)
  const [motif, setMotif] = useState('')

  async function basculerBlocage(lot: Lot): Promise<void> {
    const r = await action.executer('stock.bloquerLot', {
      lotId: lot.id,
      bloque: !lot.bloque,
      motif: lot.bloque ? null : 'Blocage manuel depuis la fiche stock'
    })
    if (r !== null) {
      lots.recharger()
      onChange()
      notifications.succes(lot.bloque ? 'Lot débloqué' : 'Lot bloqué')
    }
  }

  async function ajuster(): Promise<void> {
    if (!ajustement) return
    const r = await action.executer('stock.ajusterLot', {
      lotId: ajustement.id,
      quantite,
      motif: motif.trim()
    })
    if (r !== null) {
      setAjustement(null)
      setMotif('')
      lots.recharger()
      onChange()
      notifications.succes('Stock ajusté')
    }
  }

  if (ajustement) {
    return (
      <Modale
        titre="Ajuster un lot"
        description={`Lot ${ajustement.numero ?? 'sans numéro'} — ${nombre(ajustement.quantite_restante)} en stock`}
        onFermer={() => setAjustement(null)}
        pied={
          <>
            <Bouton onClick={() => setAjustement(null)}>Annuler</Bouton>
            <Bouton
              variante="principal"
              disabled={motif.trim().length < 3}
              enCours={action.enCours}
              onClick={ajuster}
            >
              Ajuster
            </Bouton>
          </>
        }
      >
        <div className="panneau-corps pile">
          {action.erreur ? <Bandeau ton="danger">{action.erreur.message}</Bandeau> : null}
          <Bandeau ton="attention">
            Un ajustement corrige le stock sans passer par une vente ou une réception. L’écart est
            enregistré au journal avec votre motif.
          </Bandeau>
          <Champ
            libelle="Quantité réellement présente"
            obligatoire
            type="number"
            min={0}
            value={quantite}
            onChange={(e) => setQuantite(Number(e.target.value))}
            aide={`Écart : ${quantite - ajustement.quantite_restante > 0 ? '+' : ''}${quantite - ajustement.quantite_restante}`}
          />
          <ZoneTexte
            libelle="Motif de l’ajustement"
            obligatoire
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Erreur de comptage à la réception, casse non enregistrée…"
          />
        </div>
      </Modale>
    )
  }

  return (
    <Modale
      titre={`Lots — ${produit.nom_commercial}`}
      description="Les lots sont servis du plus proche au plus lointain de la péremption."
      large
      onFermer={onFermer}
      pied={
        <Bouton variante="principal" onClick={onFermer}>
          Fermer
        </Bouton>
      }
    >
      {lots.chargement ? (
        <Chargement />
      ) : (lots.donnees?.length ?? 0) === 0 ? (
        <EtatVide icone="stock" titre="Aucun lot en stock">
          Ce produit est en rupture. Enregistrez une réception pour créer un lot.
        </EtatVide>
      ) : (
        <div className="tableau-defilement">
          <table className="tableau">
            <thead>
              <tr>
                <th>Lot</th>
                <th>Reçu le</th>
                <th>Péremption</th>
                <th className="cellule-nombre">Restant</th>
                <th className="cellule-nombre">Prix d’achat</th>
                <th>État</th>
                <th className="cellule-actions" />
              </tr>
            </thead>
            <tbody>
              {lots.donnees!.map((l, index) => (
                <tr key={l.id}>
                  <td>
                    <CellulePrincipale
                      titre={l.numero ?? 'Sans numéro'}
                      sous={index === 0 && !l.bloque ? 'Servi en priorité' : undefined}
                    />
                  </td>
                  <td>{dateCourte(l.date_reception)}</td>
                  <td>{dateCourte(l.date_peremption)}</td>
                  <td className="cellule-nombre">
                    <strong>{nombre(l.quantite_restante)}</strong>
                    <span style={{ color: 'var(--texte-faible)' }}> / {nombre(l.quantite_initiale)}</span>
                  </td>
                  <td className="cellule-nombre">{montant(l.prix_achat)}</td>
                  <td>
                    {l.bloque ? (
                      <Etiquette ton="danger">Bloqué</Etiquette>
                    ) : (
                      <Etiquette ton="succes">Disponible</Etiquette>
                    )}
                  </td>
                  <td className="cellule-actions">
                    <div className="rangee" style={{ justifyContent: 'flex-end', gap: 4 }}>
                      {session.peut('stock.ajuster') ? (
                        <Bouton
                          compact
                          variante="discret"
                          onClick={() => {
                            setAjustement(l)
                            setQuantite(l.quantite_restante)
                          }}
                        >
                          Ajuster
                        </Bouton>
                      ) : null}
                      {session.peut('stock.bloquer_lot') ? (
                        <Bouton compact variante="discret" onClick={() => basculerBlocage(l)}>
                          {l.bloque ? 'Débloquer' : 'Bloquer'}
                        </Bouton>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modale>
  )
}
