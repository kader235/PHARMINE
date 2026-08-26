import { useEffect, useRef, useState } from 'react'
import type {
  EtatRepertoire,
  FicheRepertoire,
  Lot,
  MouvementStock,
  Page,
  ProduitEtat
} from '@shared/types'
import { useAction, useDifferee, useRequete } from '../lib/hooks'
import { useSession } from '../app/Session'
import { useFonctions } from '../app/fonctions'
import type { Destination } from '../app/navigation'
import { useNotifications } from '../ui/Notifications'
import {
  Bandeau,
  Bouton,
  Case,
  Champ,
  ChampMontant,
  Chargement,
  Confirmation,
  EntetePage,
  Etiquette,
  EtatVide,
  Liste,
  Modale,
  Segments,
  ZoneTexte
} from '../ui/Composants'
import Tableau, { CellulePrincipale, RechercheTableau } from '../ui/Tableau'
import Icone from '../ui/Icone'
import { useLecteurCodeBarres } from '../lib/codeBarres'
import { dateCourte, etatStock, montant, nombre, pourcentage, typeMouvement } from '../lib/format'

interface Referentiels {
  categories: { id: number; nom: string }[]
  formes: { id: number; nom: string; abbreviation: string | null }[]
  unites: { id: number; nom: string; abbreviation: string }[]
  laboratoires: { id: number; nom: string }[]
}

export default function Produits({ destination }: { destination: Destination }) {
  const session = useSession()
  const notifications = useNotifications()

  const [recherche, setRecherche] = useState('')
  const [filtreEtat, setFiltreEtat] = useState<'tous' | 'rupture' | 'faible' | 'disponible'>('tous')
  const [edition, setEdition] = useState<{ produit: ProduitEtat | null } | null>(null)
  const [detail, setDetail] = useState<number | null>(null)

  const differee = useDifferee(recherche, 200)

  useEffect(() => {
    if (destination.filtre === 'nouveau' && session.peut('produits.creer')) setEdition({ produit: null })
    if (destination.cible?.type === 'produit') setDetail(destination.cible.id)
  }, [destination, session])

  const liste = useRequete<Page<ProduitEtat>>('produits.lister', {
    recherche: differee.trim() || undefined,
    etat: filtreEtat === 'tous' ? undefined : filtreEtat,
    parPage: 500
  })

  const referentiels = useRequete<Referentiels>('produits.referentiels')

  useFonctions('produits', [
    {
      touche: 'F2',
      libelle: 'Nouveau produit',
      action: () => setEdition({ produit: null }),
      disponible: session.peut('produits.creer'),
      saillante: true
    },
    { touche: 'F5', libelle: 'Actualiser', action: () => liste.recharger() },
    {
      touche: 'F7',
      libelle: 'Voir les ruptures',
      action: () => setFiltreEtat((f) => (f === 'rupture' ? 'tous' : 'rupture'))
    }
  ])

  return (
    <>
      <EntetePage
        titre="Produits"
        actions={
          session.peut('produits.creer') ? (
            <Bouton variante="principal" icone="plus" onClick={() => setEdition({ produit: null })}>
              Ajouter un produit
            </Bouton>
          ) : null
        }
      />

      <Tableau
        colonnes={[
          {
            cle: 'nom',
            entete: 'Produit',
            triSur: (p: ProduitEtat) => p.nom_commercial,
            rendu: (p: ProduitEtat) => (
              <CellulePrincipale
                titre={
                  <>
                    {p.nom_commercial} {p.dosage ?? ''}
                    {p.ordonnance_requise ? (
                      <span className="marque-ordonnance" title="Délivrance sur ordonnance">
                        Ordonnance
                      </span>
                    ) : null}
                  </>
                }
                sous={[p.code_interne, p.forme, p.emplacement].filter(Boolean).join(' · ')}
              />
            )
          },
          {
            cle: 'categorie',
            entete: 'Catégorie',
            largeur: '150px',
            rendu: (p: ProduitEtat) => p.categorie ?? '—',
            triSur: (p: ProduitEtat) => p.categorie ?? ''
          },
          {
            cle: 'prix_vente',
            entete: 'Prix de vente',
            nombre: true,
            rendu: (p: ProduitEtat) => montant(p.prix_vente),
            triSur: (p: ProduitEtat) => p.prix_vente
          },
          {
            cle: 'marge',
            entete: 'Marge',
            nombre: true,
            rendu: (p: ProduitEtat) =>
              p.prix_vente > 0 ? pourcentage(((p.prix_vente - p.prix_achat) / p.prix_vente) * 100) : '—',
            triSur: (p: ProduitEtat) => (p.prix_vente > 0 ? (p.prix_vente - p.prix_achat) / p.prix_vente : 0)
          },
          {
            cle: 'stock',
            entete: 'Stock',
            nombre: true,
            rendu: (p: ProduitEtat) => (
              <span>
                {nombre(p.stock_disponible)}
                <span style={{ color: 'var(--texte-faible)' }}> / {nombre(p.stock_min)}</span>
              </span>
            ),
            triSur: (p: ProduitEtat) => p.stock_disponible
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
          }
        ]}
        lignes={liste.donnees?.lignes ?? null}
        cle={(p) => p.id}
        chargement={liste.chargement}
        erreur={liste.erreur}
        onReessayer={liste.recharger}
        onLigneClic={(p) => setDetail(p.id)}
        parPage={30}
        filtreActif={differee.trim().length > 0 || filtreEtat !== 'tous'}
        resume={(n) => `${n} référence${n > 1 ? 's' : ''} au catalogue`}
        outils={
          <>
            <RechercheTableau
              valeur={recherche}
              onChange={setRecherche}
              placeholder="Nom, générique, principe actif, code-barres…"
              largeur={340}
            />
            <Segments
              valeur={filtreEtat}
              options={[
                { valeur: 'tous', libelle: 'Tous' },
                { valeur: 'disponible', libelle: 'Disponibles' },
                { valeur: 'faible', libelle: 'Stock faible' },
                { valeur: 'rupture', libelle: 'Ruptures' }
              ]}
              onChange={setFiltreEtat}
            />
          </>
        }
        vide={
          <EtatVide
            icone="produit"
            titre="Aucun produit au catalogue"
            action={
              session.peut('produits.creer') ? (
                <Bouton variante="principal" icone="plus" onClick={() => setEdition({ produit: null })}>
                  Ajouter votre premier produit
                </Bouton>
              ) : undefined
            }
          >
            Le catalogue est le point de départ : il alimente la caisse, le stock et les réceptions.
          </EtatVide>
        }
        videApresFiltre={
          <EtatVide icone="recherche" titre="Aucun produit ne correspond">
            Modifiez la recherche ou changez de filtre.
          </EtatVide>
        }
      />

      {edition ? (
        <FormulaireProduit
          produit={edition.produit}
          referentiels={referentiels.donnees}
          onFermer={() => setEdition(null)}
          onEnregistre={(nouveau) => {
            setEdition(null)
            liste.recharger()
            notifications.succes(nouveau ? 'Produit créé' : 'Produit modifié')
          }}
        />
      ) : null}

      {detail !== null ? (
        <FicheProduit
          id={detail}
          onFermer={() => setDetail(null)}
          onModifier={(p) => {
            setDetail(null)
            setEdition({ produit: p })
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

/**
 * Création d'un produit, en deux temps.
 *
 * Temps 1 — on cherche le produit dans le répertoire livré avec le logiciel.
 * Trois lettres suffisent. La fiche choisie remplit la dénomination, le
 * principe actif, le dosage, la forme, la catégorie, l'unité de vente et le
 * statut d'ordonnance.
 *
 * Temps 2 — il ne reste que ce que le répertoire ne peut pas savoir : les
 * prix de l'officine. Le prix de vente est proposé à partir de la marge
 * habituelle, et reste modifiable.
 *
 * Un produit absent du répertoire se saisit librement : le répertoire aide,
 * il n'enferme pas.
 */
function FormulaireProduit({
  produit,
  referentiels,
  onFermer,
  onEnregistre
}: {
  produit: ProduitEtat | null
  referentiels: Referentiels | null
  onFermer: () => void
  onEnregistre: (nouveau: boolean) => void
}) {
  const action = useAction()
  const notifications = useNotifications()
  const reglages = useRequete<{ margeParDefaut: number }>('app.reglages')

  // À la modification, la fiche est déjà connue : pas d'étape de recherche.
  const [etape, setEtape] = useState<'recherche' | 'fiche'>(produit ? 'fiche' : 'recherche')
  const [origine, setOrigine] = useState<FicheRepertoire | null>(null)
  const [avance, setAvance] = useState(false)
  const [prixVenteTouche, setPrixVenteTouche] = useState(false)

  const [donnees, setDonnees] = useState({
    nomCommercial: produit?.nom_commercial ?? '',
    nomGenerique: produit?.nom_generique ?? '',
    principeActif: produit?.principe_actif ?? '',
    dosage: produit?.dosage ?? '',
    categorieId: produit?.categorie_id ?? null,
    laboratoireId: produit?.laboratoire_id ?? null,
    formeId: produit?.forme_id ?? null,
    uniteId: produit?.unite_id ?? null,
    prixAchat: produit?.prix_achat ?? 0,
    prixVente: produit?.prix_vente ?? 0,
    stockMin: produit?.stock_min ?? 10,
    stockMax: produit?.stock_max ?? null,
    emplacement: produit?.emplacement ?? '',
    ordonnanceRequise: produit?.ordonnance_requise === 1,
    suiviPeremption: produit ? produit.suivi_peremption === 1 : true,
    venteAutorisee: produit ? produit.vente_autorisee === 1 : true,
    notes: produit?.notes ?? '',
    codesBarres: (produit?.codes_barres ?? []).join(', ')
  })

  // Un code-barres lu pendant la saisie se range tout seul : c'est le geste
  // naturel quand on a la boîte en main.
  useLecteurCodeBarres({
    onScan: (code) => {
      setDonnees((d) => {
        const codes = d.codesBarres
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean)
        if (codes.includes(code)) return d
        notifications.info(`Code-barres ${code} ajouté`)
        return { ...d, codesBarres: [...codes, code].join(', ') }
      })
      if (etape === 'recherche') setEtape('fiche')
    }
  })

  const marge = reglages.donnees?.margeParDefaut ?? 30

  function choisir(fiche: FicheRepertoire): void {
    setOrigine(fiche)
    setDonnees((d) => ({
      ...d,
      nomCommercial: fiche.nomCourt,
      dosage: fiche.dosage ?? '',
      nomGenerique: fiche.dci ?? '',
      principeActif: fiche.dci ?? '',
      formeId: fiche.formeId,
      categorieId: fiche.categorieId,
      uniteId: fiche.uniteId,
      ordonnanceRequise: fiche.ordonnance,
      // Un dispositif ou un accessoire ne se périme pas comme un médicament.
      suiviPeremption: fiche.categorie !== 'Matériel médical'
    }))
    setEtape('fiche')
  }

  function saisirLibrement(nom: string): void {
    setOrigine(null)
    setDonnees((d) => ({ ...d, nomCommercial: nom.trim() }))
    setEtape('fiche')
  }

  /**
   * Prix d'achat saisi : on propose une vente cohérente tant que rien n'a été
   * tapé dans le champ de vente.
   *
   * La marge se calcule sur le prix de vente, comme partout ailleurs dans le
   * logiciel — proposer un coefficient sur le prix d'achat afficherait
   * ensuite une marge différente de celle annoncée.
   */
  function changerPrixAchat(valeur: number): void {
    setDonnees((d) => {
      const applicable = marge > 0 && marge < 95 && valeur > 0
      const propose = applicable ? Math.round(valeur / (1 - marge / 100)) : d.prixVente
      return { ...d, prixAchat: valeur, prixVente: prixVenteTouche ? d.prixVente : propose }
    })
  }

  const valide = donnees.nomCommercial.trim().length >= 2 && donnees.prixVente > 0
  const margeReelle =
    donnees.prixVente > 0 ? ((donnees.prixVente - donnees.prixAchat) / donnees.prixVente) * 100 : null

  async function enregistrer(): Promise<void> {
    const charge = {
      ...donnees,
      nomGenerique: donnees.nomGenerique.trim() || null,
      principeActif: donnees.principeActif.trim() || null,
      dosage: donnees.dosage.trim() || null,
      emplacement: donnees.emplacement.trim() || null,
      notes: donnees.notes.trim() || null,
      codesBarres: donnees.codesBarres
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean)
    }

    const resultat = produit
      ? await action.executer('produits.modifier', { id: produit.id, donnees: charge })
      : await action.executer('produits.creer', charge)

    if (resultat !== null) onEnregistre(!produit)
  }

  // ---------------------------------------------------------------------------
  // Temps 1 : le répertoire
  // ---------------------------------------------------------------------------
  if (etape === 'recherche') {
    return (
      <Modale titre="Nouveau produit" large onFermer={onFermer}>
        <RechercheRepertoire onChoisir={choisir} onLibre={saisirLibrement} />
      </Modale>
    )
  }

  // ---------------------------------------------------------------------------
  // Temps 2 : la fiche
  // ---------------------------------------------------------------------------
  return (
    <Modale
      titre={produit ? `Modifier ${produit.nom_commercial}` : 'Nouveau produit'}
      large
      onFermer={onFermer}
      pied={
        <>
          {produit ? null : (
            <Bouton onClick={() => setEtape('recherche')}>Revenir au répertoire</Bouton>
          )}
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="principal" disabled={!valide} enCours={action.enCours} onClick={enregistrer}>
            {produit ? 'Enregistrer les modifications' : 'Créer le produit'}
          </Bouton>
        </>
      }
    >
      {action.erreur ? (
        <div style={{ padding: '12px 14px 0' }}>
          <Bandeau ton="danger">{action.erreur.message}</Bandeau>
        </div>
      ) : null}

      {origine ? (
        <div className="fiche-origine">
          <Icone nom="etiquette" taille={15} />
          <span>
            <strong>{origine.nom}</strong>
            {origine.classe ? ` · ${origine.classe}` : ''} — fiche du répertoire, modifiable.
          </span>
        </div>
      ) : null}

      <div className="formulaire-section">
        <div className="formulaire-titre">Prix de l’officine</div>
        <div className="grille trois">
          <ChampMontant
            libelle="Prix d’achat"
            valeur={donnees.prixAchat}
            onChangeValeur={changerPrixAchat}
            aide="Mis à jour automatiquement à chaque réception."
          />
          <ChampMontant
            libelle="Prix de vente"
            obligatoire
            valeur={donnees.prixVente}
            onChangeValeur={(v) => {
              setPrixVenteTouche(true)
              setDonnees({ ...donnees, prixVente: v })
            }}
            aide={
              margeReelle !== null
                ? `Marge de ${pourcentage(margeReelle)}`
                : marge > 0
                  ? `Proposé à ${marge} % de marge dès le prix d’achat saisi.`
                  : undefined
            }
          />
          <Champ
            libelle="Seuil minimum"
            type="number"
            min={0}
            value={donnees.stockMin}
            onChange={(e) => setDonnees({ ...donnees, stockMin: Number(e.target.value) })}
            aide="En dessous, une alerte est levée."
          />
        </div>
      </div>

      <div className="formulaire-section">
        <div className="formulaire-titre">Identification</div>
        <div className="grille deux">
          <Champ
            libelle="Nom commercial"
            obligatoire
            large
            value={donnees.nomCommercial}
            onChange={(e) => setDonnees({ ...donnees, nomCommercial: e.target.value })}
            placeholder="Doliprane"
          />
          <Champ
            libelle="Dosage"
            value={donnees.dosage}
            onChange={(e) => setDonnees({ ...donnees, dosage: e.target.value })}
            placeholder="500 mg"
          />
          <Liste
            libelle="Forme pharmaceutique"
            vide="Non précisée"
            options={(referentiels?.formes ?? []).map((f) => ({ valeur: f.id, libelle: f.nom }))}
            value={donnees.formeId ?? ''}
            onChange={(e) => setDonnees({ ...donnees, formeId: e.target.value ? Number(e.target.value) : null })}
          />
          <Champ
            libelle="Principe actif"
            value={donnees.principeActif}
            onChange={(e) => setDonnees({ ...donnees, principeActif: e.target.value })}
            aide="Utilisé par la recherche du comptoir."
          />
          <Liste
            libelle="Catégorie"
            vide="Non classé"
            options={(referentiels?.categories ?? []).map((c) => ({ valeur: c.id, libelle: c.nom }))}
            value={donnees.categorieId ?? ''}
            onChange={(e) => setDonnees({ ...donnees, categorieId: e.target.value ? Number(e.target.value) : null })}
          />
          <Liste
            libelle="Unité de vente"
            vide="Unité"
            options={(referentiels?.unites ?? []).map((u) => ({ valeur: u.id, libelle: u.nom }))}
            value={donnees.uniteId ?? ''}
            onChange={(e) => setDonnees({ ...donnees, uniteId: e.target.value ? Number(e.target.value) : null })}
          />
          <Champ
            libelle="Emplacement"
            value={donnees.emplacement}
            onChange={(e) => setDonnees({ ...donnees, emplacement: e.target.value })}
            placeholder="Rayon A-12"
          />
          <Champ
            libelle="Codes-barres"
            large
            value={donnees.codesBarres}
            onChange={(e) => setDonnees({ ...donnees, codesBarres: e.target.value })}
            aide="Scannez la boîte : le code se range ici tout seul."
          />
        </div>
      </div>

      <div className="formulaire-section">
        <button
          type="button"
          className="bouton discret compact"
          onClick={() => setAvance((a) => !a)}
          style={{ marginBottom: avance ? 12 : 0 }}
        >
          {avance ? 'Masquer' : 'Afficher'} les options avancées
        </button>

        {avance ? (
          <div className="pile">
            <Case
              libelle="Soumis à ordonnance"
              description="Un avertissement s’affichera lors de la vente."
              checked={donnees.ordonnanceRequise}
              onChange={(e) => setDonnees({ ...donnees, ordonnanceRequise: e.target.checked })}
            />
            <Case
              libelle="Suivre les dates de péremption"
              description="Décochez pour un article non périssable (matériel, accessoire)."
              checked={donnees.suiviPeremption}
              onChange={(e) => setDonnees({ ...donnees, suiviPeremption: e.target.checked })}
            />
            <Case
              libelle="Autorisé à la vente"
              description="Décochez pour retirer temporairement le produit du comptoir."
              checked={donnees.venteAutorisee}
              onChange={(e) => setDonnees({ ...donnees, venteAutorisee: e.target.checked })}
            />
            <Champ
              libelle="Nom générique"
              value={donnees.nomGenerique}
              onChange={(e) => setDonnees({ ...donnees, nomGenerique: e.target.value })}
              placeholder="Paracétamol"
            />
            <Champ
              libelle="Stock maximum"
              type="number"
              min={0}
              value={donnees.stockMax ?? ''}
              onChange={(e) =>
                setDonnees({ ...donnees, stockMax: e.target.value ? Number(e.target.value) : null })
              }
              aide="Au-delà, le produit est signalé en surstock. Facultatif."
            />
            <ZoneTexte
              libelle="Notes internes"
              value={donnees.notes}
              onChange={(e) => setDonnees({ ...donnees, notes: e.target.value })}
            />
          </div>
        ) : null}
      </div>
    </Modale>
  )
}

/**
 * Champ de recherche du répertoire.
 *
 * Entièrement pilotable au clavier : on tape, on descend, on valide. Un
 * comptoir n'a pas le temps d'attraper la souris.
 */
function RechercheRepertoire({
  onChoisir,
  onLibre
}: {
  onChoisir: (fiche: FicheRepertoire) => void
  onLibre: (nom: string) => void
}) {
  const [saisie, setSaisie] = useState('')
  const [surligne, setSurligne] = useState(0)
  const differee = useDifferee(saisie, 120)
  const champ = useRef<HTMLInputElement>(null)

  const etat = useRequete<EtatRepertoire>('repertoire.etat')
  const resultats = useRequete<FicheRepertoire[]>(
    'repertoire.rechercher',
    { saisie: differee.trim(), limite: 10 },
    differee.trim().length >= 1
  )

  const fiches = resultats.donnees ?? []

  useEffect(() => {
    champ.current?.focus()
  }, [])

  useEffect(() => {
    setSurligne(0)
  }, [differee])

  function auClavier(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSurligne((i) => Math.min(i + 1, fiches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSurligne((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (fiches[surligne]) onChoisir(fiches[surligne]!)
      else if (saisie.trim().length >= 2) onLibre(saisie)
    }
  }

  const repertoireAbsent = etat.donnees && !etat.donnees.disponible

  return (
    <div className="assistant-produit">
      <label className="assistant-question" htmlFor="assistant-saisie">
        Quel produit voulez-vous enregistrer ?
      </label>

      <input
        id="assistant-saisie"
        ref={champ}
        className="assistant-saisie"
        value={saisie}
        onChange={(e) => setSaisie(e.target.value)}
        onKeyDown={auClavier}
        placeholder="Nom, principe actif ou classe — par exemple « parac », « amox », « seringue »"
        autoComplete="off"
      />

      {repertoireAbsent ? (
        <Bandeau ton="attention">
          Le répertoire n’est pas disponible sur ce poste ({etat.donnees?.motif}). La saisie manuelle
          reste possible.
        </Bandeau>
      ) : (
        <p className="assistant-aide">
          {etat.donnees?.produits ?? 0} produits référencés. La fiche choisie remplit la
          dénomination, le principe actif, le dosage et la forme : il ne vous restera que vos prix.
        </p>
      )}

      {saisie.trim().length >= 1 ? (
        fiches.length > 0 ? (
          <div className="suggestions" role="listbox">
            {fiches.map((fiche, index) => (
              <button
                key={fiche.id}
                type="button"
                role="option"
                aria-selected={index === surligne}
                className={`suggestion${index === surligne ? ' surligne' : ''}`}
                onMouseEnter={() => setSurligne(index)}
                onClick={() => onChoisir(fiche)}
              >
                <span className="suggestion-nom">
                  {fiche.nom}
                  {fiche.dejaAuCatalogue ? <Etiquette ton="info">Déjà au catalogue</Etiquette> : null}
                  {fiche.ordonnance ? <Etiquette ton="attention">Ordonnance</Etiquette> : null}
                </span>
                <span className="suggestion-detail">
                  {[fiche.dci, fiche.forme, fiche.classe].filter(Boolean).join(' · ')}
                </span>
              </button>
            ))}
          </div>
        ) : resultats.chargement ? null : (
          <div className="suggestions-vide">
            Aucune fiche ne correspond à « {saisie.trim()} ».
          </div>
        )
      ) : null}

      <div className="assistant-pied">
        <Bouton icone="plus" onClick={() => onLibre(saisie)} disabled={saisie.trim().length < 2}>
          Saisir « {saisie.trim() || '…' } » sans le répertoire
        </Bouton>
      </div>
    </div>
  )
}

// ===========================================================================
// Fiche produit
// ===========================================================================

function FicheProduit({
  id,
  onFermer,
  onModifier,
  onChange
}: {
  id: number
  onFermer: () => void
  onModifier: (produit: ProduitEtat) => void
  onChange: () => void
}) {
  const session = useSession()
  const notifications = useNotifications()
  const [onglet, setOnglet] = useState<'general' | 'lots' | 'historique' | 'statistiques'>('general')
  const [archivage, setArchivage] = useState(false)
  const action = useAction()

  const produit = useRequete<ProduitEtat>('produits.detail', { id })
  const lots = useRequete<Lot[]>('stock.lots', { produitId: id }, onglet === 'lots' && session.peut('stock.voir'))
  const mouvements = useRequete<MouvementStock[]>(
    'stock.mouvements',
    { produitId: id, limite: 100 },
    onglet === 'historique' && session.peut('stock.voir')
  )
  const stats = useRequete<{
    ventes30j: number
    quantite30j: number
    ventes12m: { mois: string; quantite: number; montant: number }[]
    margeUnitaire: number
    tauxMarge: number
  }>('produits.statistiques', { id }, onglet === 'statistiques')

  async function archiver(): Promise<void> {
    const r = await action.executer('produits.archiver', { id, archiver: true })
    if (r !== null) {
      setArchivage(false)
      onChange()
      onFermer()
      notifications.succes('Produit archivé')
    }
  }

  if (!produit.donnees) {
    return (
      <Modale titre="Fiche produit" onFermer={onFermer}>
        <div className="panneau-corps">
          {produit.erreur ? <Bandeau ton="danger">{produit.erreur.message}</Bandeau> : <Chargement />}
        </div>
      </Modale>
    )
  }

  const p = produit.donnees
  const e = etatStock(p.etat_stock)

  return (
    <>
      <Modale
        titre={`${p.nom_commercial} ${p.dosage ?? ''}`}
        description={[p.code_interne, p.forme, p.laboratoire].filter(Boolean).join(' · ')}
        large
        onFermer={onFermer}
        pied={
          <>
            {session.peut('produits.archiver') ? (
              <Bouton className="a-gauche" variante="danger" icone="corbeille" onClick={() => setArchivage(true)}>
                Archiver
              </Bouton>
            ) : null}
            {session.peut('produits.modifier') ? (
              <Bouton icone="crayon" onClick={() => onModifier(p)}>
                Modifier
              </Bouton>
            ) : null}
            <Bouton variante="principal" onClick={onFermer}>
              Fermer
            </Bouton>
          </>
        }
      >
        <div className="tableau-outils">
          <Segments
            valeur={onglet}
            options={[
              { valeur: 'general', libelle: 'Général' },
              { valeur: 'lots', libelle: 'Lots' },
              { valeur: 'historique', libelle: 'Historique' },
              { valeur: 'statistiques', libelle: 'Statistiques' }
            ]}
            onChange={setOnglet}
          />
          <div style={{ marginLeft: 'auto' }}>
            <Etiquette ton={e.ton}>{e.libelle}</Etiquette>
          </div>
        </div>

        {onglet === 'general' ? (
          <div className="panneau-corps">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div>
                <div className="formulaire-titre">Commercial</div>
                <dl className="liste-definitions">
                  <dt>Nom générique</dt>
                  <dd>{p.nom_generique ?? '—'}</dd>
                  <dt>Principe actif</dt>
                  <dd>{p.principe_actif ?? '—'}</dd>
                  <dt>Catégorie</dt>
                  <dd>{p.categorie ?? '—'}</dd>
                  <dt>Prix d’achat</dt>
                  <dd>{montant(p.prix_achat)}</dd>
                  <dt>Prix de vente</dt>
                  <dd style={{ fontWeight: 600 }}>{montant(p.prix_vente)}</dd>
                  <dt>Marge unitaire</dt>
                  <dd>
                    {montant(p.prix_vente - p.prix_achat)}
                    {p.prix_vente > 0
                      ? ` (${pourcentage(((p.prix_vente - p.prix_achat) / p.prix_vente) * 100)})`
                      : ''}
                  </dd>
                </dl>
              </div>
              <div>
                <div className="formulaire-titre">Stock</div>
                <dl className="liste-definitions">
                  <dt>Disponible</dt>
                  <dd style={{ fontWeight: 600 }}>{nombre(p.stock_disponible)}</dd>
                  <dt>Total en lots</dt>
                  <dd>{nombre(p.stock)}</dd>
                  <dt>Seuil minimum</dt>
                  <dd>{nombre(p.stock_min)}</dd>
                  <dt>Lots actifs</dt>
                  <dd>{nombre(p.lots_actifs)}</dd>
                  <dt>Prochaine péremption</dt>
                  <dd>{dateCourte(p.prochaine_peremption)}</dd>
                  <dt>Valeur du stock</dt>
                  <dd>{montant(p.valeur_achat)}</dd>
                  <dt>Emplacement</dt>
                  <dd>{p.emplacement ?? '—'}</dd>
                </dl>
              </div>
            </div>

            {p.codes_barres?.length ? (
              <div style={{ marginTop: 16 }}>
                <div className="formulaire-titre">Codes-barres</div>
                <div className="rangee">
                  {p.codes_barres.map((c) => (
                    <Etiquette key={c} ton="neutre" sansPoint>
                      {c}
                    </Etiquette>
                  ))}
                </div>
              </div>
            ) : null}

            {p.notes ? (
              <div style={{ marginTop: 16 }}>
                <div className="formulaire-titre">Notes</div>
                <p style={{ fontSize: 12.5, color: 'var(--texte-attenue)' }}>{p.notes}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {onglet === 'lots' ? (
          lots.chargement ? (
            <Chargement />
          ) : (lots.donnees?.length ?? 0) === 0 ? (
            <EtatVide icone="stock" titre="Aucun lot en stock">
              Ce produit n’a plus de stock. Enregistrez une réception pour créer un nouveau lot.
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
                  </tr>
                </thead>
                <tbody>
                  {lots.donnees!.map((l) => (
                    <tr key={l.id}>
                      <td>{l.numero ?? <span style={{ color: 'var(--texte-faible)' }}>Sans numéro</span>}</td>
                      <td>{dateCourte(l.date_reception)}</td>
                      <td>{dateCourte(l.date_peremption)}</td>
                      <td className="cellule-nombre">
                        {nombre(l.quantite_restante)}
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {onglet === 'historique' ? (
          mouvements.chargement ? (
            <Chargement />
          ) : (mouvements.donnees?.length ?? 0) === 0 ? (
            <EtatVide icone="journal" titre="Aucun mouvement enregistré">
              Les entrées, sorties et ajustements de ce produit apparaîtront ici.
            </EtatVide>
          ) : (
            <div className="tableau-defilement" style={{ maxHeight: 400, overflowY: 'auto' }}>
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Opération</th>
                    <th>Lot</th>
                    <th className="cellule-nombre">Quantité</th>
                    <th className="cellule-nombre">Stock après</th>
                    <th>Motif</th>
                    <th>Par</th>
                  </tr>
                </thead>
                <tbody>
                  {mouvements.donnees!.map((m) => (
                    <tr key={m.id}>
                      <td>{dateCourte(m.at)}</td>
                      <td>{typeMouvement(m.type)}</td>
                      <td style={{ color: 'var(--texte-faible)' }}>{m.numero_lot ?? '—'}</td>
                      <td className="cellule-nombre">
                        <strong style={{ color: m.quantite < 0 ? 'var(--danger)' : 'var(--succes)' }}>
                          {m.quantite > 0 ? '+' : ''}
                          {nombre(m.quantite)}
                        </strong>
                      </td>
                      <td className="cellule-nombre">{nombre(m.stock_apres)}</td>
                      <td style={{ color: 'var(--texte-attenue)' }}>{m.motif ?? '—'}</td>
                      <td style={{ color: 'var(--texte-attenue)' }}>{m.utilisateur ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {onglet === 'statistiques' ? (
          stats.chargement ? (
            <Chargement />
          ) : !stats.donnees ? (
            <EtatVide icone="rapport" titre="Statistiques indisponibles" />
          ) : stats.donnees.ventes12m.length === 0 ? (
            <EtatVide icone="rapport" titre="Ce produit n’a pas encore été vendu">
              Les statistiques apparaîtront après la première vente.
            </EtatVide>
          ) : (
            <div className="panneau-corps">
              <dl className="liste-definitions" style={{ marginBottom: 18 }}>
                <dt>Ventes sur 30 jours</dt>
                <dd>{nombre(stats.donnees.ventes30j)}</dd>
                <dt>Quantité écoulée sur 30 jours</dt>
                <dd>{nombre(stats.donnees.quantite30j)}</dd>
                <dt>Marge unitaire</dt>
                <dd>
                  {montant(stats.donnees.margeUnitaire)} ({pourcentage(stats.donnees.tauxMarge)})
                </dd>
              </dl>

              <div className="formulaire-titre">Évolution sur 12 mois</div>
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Mois</th>
                    <th className="cellule-nombre">Quantité</th>
                    <th className="cellule-nombre">Chiffre d’affaires</th>
                    <th style={{ width: 160 }}>Part</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const maximum = Math.max(...stats.donnees!.ventes12m.map((m) => m.quantite))
                    return stats.donnees!.ventes12m.map((m) => (
                      <tr key={m.mois}>
                        <td>{m.mois}</td>
                        <td className="cellule-nombre">{nombre(m.quantite)}</td>
                        <td className="cellule-nombre">{montant(m.montant)}</td>
                        <td>
                          <div className="jauge">
                            <div
                              className="jauge-remplissage"
                              style={{ width: `${maximum ? (m.quantite / maximum) * 100 : 0}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))
                  })()}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </Modale>

      {archivage ? (
        <Confirmation
          titre="Archiver ce produit"
          message={`${p.nom_commercial} ne sera plus proposé au comptoir ni dans les réceptions. Son historique et ses ventes passées restent consultables.`}
          detail={
            p.stock_disponible > 0 ? (
              <Bandeau ton="attention" titre={`${nombre(p.stock_disponible)} unité(s) encore en stock`}>
                Un produit ne peut pas être archivé tant qu’il reste du stock. Écoulez-le ou
                enregistrez une sortie pour perte.
              </Bandeau>
            ) : action.erreur ? (
              <Bandeau ton="danger">{action.erreur.message}</Bandeau>
            ) : undefined
          }
          libelleAction="Archiver"
          danger
          enCours={action.enCours}
          onConfirmer={archiver}
          onAnnuler={() => setArchivage(false)}
        />
      ) : null}
    </>
  )
}
