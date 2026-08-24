import { useCallback, useEffect, useState } from 'react'
import { useRequete } from '../lib/hooks'
import { useSession } from '../app/Session'
import { useFonctions } from '../app/fonctions'
import { useNotifications } from '../ui/Notifications'
import { useImpression } from '../ui/Impression'
import { DocumentTableau } from '../ui/Documents'
import { enregistrerCSV } from '../lib/export'
import {
  Bouton,
  Champ,
  EntetePage,
  EtatVide,
  Indicateur,
  Panneau,
  Segments
} from '../ui/Composants'
import Tableau, { CellulePrincipale } from '../ui/Tableau'
import { aujourdhui, dateCourte, debutDuMois, decalerJours, montant, nombre } from '../lib/format'

type Rapport = 'ventes' | 'produits' | 'stock'
type Periode = 'semaine' | 'mois' | 'trimestre' | 'personnalise'

/** Ce que chaque écran de rapport publie pour l'impression et l'export. */
export interface SortieRapport {
  titre: string
  colonnes: { entete: string; droite?: boolean }[]
  lignes: (string | number)[][]
  totaux?: (string | number)[]
}

export default function Rapports() {
  const session = useSession()
  const notifications = useNotifications()
  const { imprimer } = useImpression()
  const [rapport, setRapport] = useState<Rapport>('ventes')
  const [periode, setPeriode] = useState<Periode>('mois')
  const [depuis, setDepuis] = useState(debutDuMois())
  const [jusqua, setJusqua] = useState(aujourdhui())
  const [sortie, setSortie] = useState<SortieRapport | null>(null)

  const sousTitre =
    rapport === 'stock' ? 'Situation au jour de l edition' : `Du ${dateCourte(depuis)} au ${dateCourte(jusqua)}`

  const imprimerRapport = useCallback(() => {
    if (!sortie) return
    imprimer(
      <DocumentTableau
        titre={sortie.titre}
        sousTitre={sousTitre}
        pharmacie={session.pharmacie}
        colonnes={sortie.colonnes}
        lignes={sortie.lignes}
        totaux={sortie.totaux}
      />,
      'a4'
    )
  }, [sortie, sousTitre, imprimer, session.pharmacie])

  const exporterRapport = useCallback(async () => {
    if (!sortie) return
    const fichier = await enregistrerCSV(
      `${sortie.titre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${depuis}`,
      sortie.colonnes.map((c) => c.entete),
      sortie.lignes
    )
    if (fichier) notifications.succes('Export terminé', fichier)
  }, [sortie, depuis, notifications])

  useFonctions('rapports', [
    {
      touche: 'F8',
      libelle: 'Exporter en CSV',
      action: exporterRapport,
      disponible: sortie !== null && session.peut('rapports.exporter')
    },
    {
      touche: 'F12',
      libelle: 'Imprimer',
      action: imprimerRapport,
      disponible: sortie !== null,
      saillante: true
    }
  ])

  function changerPeriode(p: Periode): void {
    setPeriode(p)
    const fin = aujourdhui()
    setJusqua(fin)
    if (p === 'semaine') setDepuis(decalerJours(fin, -6))
    else if (p === 'mois') setDepuis(debutDuMois(fin))
    else if (p === 'trimestre') setDepuis(decalerJours(fin, -89))
  }

  return (
    <>
      <EntetePage
        titre="Rapports"
        description="Transformez l’activité enregistrée en décisions concrètes."
        actions={
          <>
            <Segments
              valeur={rapport}
              options={[
                { valeur: 'ventes', libelle: 'Ventes' },
                { valeur: 'produits', libelle: 'Produits' },
                { valeur: 'stock', libelle: 'Stock' }
              ]}
              onChange={setRapport}
            />
            {session.peut('rapports.exporter') ? (
              <Bouton icone="telecharger" disabled={!sortie} onClick={exporterRapport}>
                Exporter
              </Bouton>
            ) : null}
            <Bouton icone="imprimer" disabled={!sortie} onClick={imprimerRapport}>
              Imprimer
            </Bouton>
          </>
        }
      />

      {rapport !== 'stock' ? (
        <div style={{ marginBottom: 14 }}>
          <Panneau>
            <div className="rangee" style={{ flexWrap: 'wrap' }}>
              <Segments
                valeur={periode}
                options={[
                  { valeur: 'semaine', libelle: '7 jours' },
                  { valeur: 'mois', libelle: 'Ce mois' },
                  { valeur: 'trimestre', libelle: '90 jours' },
                  { valeur: 'personnalise', libelle: 'Période' }
                ]}
                onChange={changerPeriode}
              />
              {periode === 'personnalise' ? (
                <>
                  <Champ
                    libelle="Du"
                    type="date"
                    value={depuis}
                    max={jusqua}
                    onChange={(e) => setDepuis(e.target.value)}
                  />
                  <Champ
                    libelle="Au"
                    type="date"
                    value={jusqua}
                    min={depuis}
                    max={aujourdhui()}
                    onChange={(e) => setJusqua(e.target.value)}
                  />
                </>
              ) : (
                <span style={{ color: 'var(--texte-attenue)', fontSize: 12.5 }}>
                  Du {dateCourte(depuis)} au {dateCourte(jusqua)}
                </span>
              )}
            </div>
          </Panneau>
        </div>
      ) : null}

      {rapport === 'ventes' ? <RapportVentes depuis={depuis} jusqua={jusqua} onSortie={setSortie} /> : null}
      {rapport === 'produits' ? <RapportProduits depuis={depuis} jusqua={jusqua} onSortie={setSortie} /> : null}
      {rapport === 'stock' ? <RapportStock onSortie={setSortie} /> : null}
    </>
  )
}

function RapportVentes({
  depuis,
  jusqua,
  onSortie
}: {
  depuis: string
  jusqua: string
  onSortie: (s: SortieRapport | null) => void
}) {
  const [granularite, setGranularite] = useState<'jour' | 'semaine' | 'mois'>('jour')
  const donnees = useRequete<{ periode: string; nb: number; chiffreAffaires: number; marge: number }[]>(
    'rapports.ventes',
    { depuis, jusqua, granularite }
  )

  const lignes = donnees.donnees ?? []
  const totalCa = lignes.reduce((s, l) => s + l.chiffreAffaires, 0)
  const totalMarge = lignes.reduce((s, l) => s + l.marge, 0)
  const totalNb = lignes.reduce((s, l) => s + l.nb, 0)
  const maximum = Math.max(1, ...lignes.map((l) => l.chiffreAffaires))

  // Ce que l'écran publie pour l'impression et l'export : les mêmes chiffres
  // que ceux affichés, jamais une seconde requête qui pourrait diverger.
  useEffect(() => {
    onSortie({
      titre: 'Rapport des ventes',
      colonnes: [
        { entete: 'Période' },
        { entete: 'Ventes', droite: true },
        { entete: 'Chiffre d affaires', droite: true },
        { entete: 'Marge', droite: true }
      ],
      lignes: lignes.map((l) => [l.periode, l.nb, montant(l.chiffreAffaires, false), montant(l.marge, false)]),
      totaux: ['Total', totalNb, montant(totalCa, false), montant(totalMarge, false)]
    })
    return () => onSortie(null)
  }, [donnees.donnees, onSortie])

  return (
    <>
      <div className="indicateurs">
        <Indicateur libelle="Chiffre d’affaires" valeur={montant(totalCa)} />
        <Indicateur libelle="Marge dégagée" valeur={montant(totalMarge)} />
        <Indicateur libelle="Ventes" valeur={nombre(totalNb)} />
        <Indicateur
          libelle="Panier moyen"
          valeur={montant(totalNb ? Math.round(totalCa / totalNb) : 0)}
        />
      </div>

      <Tableau
        colonnes={[
          { cle: 'periode', entete: 'Période', rendu: (l) => l.periode, triSur: (l) => l.periode },
          { cle: 'nb', entete: 'Ventes', nombre: true, rendu: (l) => nombre(l.nb), triSur: (l) => l.nb },
          {
            cle: 'ca',
            entete: 'Chiffre d’affaires',
            nombre: true,
            rendu: (l) => <strong>{montant(l.chiffreAffaires)}</strong>,
            triSur: (l) => l.chiffreAffaires
          },
          {
            cle: 'marge',
            entete: 'Marge',
            nombre: true,
            rendu: (l) => montant(l.marge),
            triSur: (l) => l.marge
          },
          {
            cle: 'part',
            entete: 'Répartition',
            largeur: '220px',
            rendu: (l) => (
              <div className="jauge">
                <div className="jauge-remplissage" style={{ width: `${(l.chiffreAffaires / maximum) * 100}%` }} />
              </div>
            )
          }
        ]}
        lignes={lignes}
        cle={(l) => l.periode}
        chargement={donnees.chargement}
        erreur={donnees.erreur}
        onReessayer={donnees.recharger}
        parPage={40}
        resume={(n) => `${n} période${n > 1 ? 's' : ''}`}
        outils={
          <Segments
            valeur={granularite}
            options={[
              { valeur: 'jour', libelle: 'Par jour' },
              { valeur: 'semaine', libelle: 'Par semaine' },
              { valeur: 'mois', libelle: 'Par mois' }
            ]}
            onChange={setGranularite}
          />
        }
        vide={
          <EtatVide icone="rapport" titre="Aucune vente sur cette période">
            Choisissez une autre période, ou commencez à enregistrer des ventes.
          </EtatVide>
        }
      />
    </>
  )
}

function RapportProduits({
  depuis,
  jusqua,
  onSortie
}: {
  depuis: string
  jusqua: string
  onSortie: (s: SortieRapport | null) => void
}) {
  const [sens, setSens] = useState<'meilleures' | 'faibles'>('meilleures')
  const donnees = useRequete<
    {
      produit_id: number
      nom_commercial: string
      quantite: number
      chiffreAffaires: number
      marge: number
      stock_disponible: number
    }[]
  >('rapports.produits', { depuis, jusqua, sens })

  const lignes = donnees.donnees ?? []
  const maximum = Math.max(1, ...lignes.map((l) => l.quantite))

  useEffect(() => {
    onSortie({
      titre: sens === 'meilleures' ? 'Meilleures ventes' : 'Produits peu vendus',
      colonnes: [
        { entete: 'Produit' },
        { entete: 'Quantité vendue', droite: true },
        { entete: 'Chiffre d affaires', droite: true },
        { entete: 'Marge', droite: true },
        { entete: 'Stock actuel', droite: true }
      ],
      lignes: lignes.map((l) => [
        l.nom_commercial,
        l.quantite,
        montant(l.chiffreAffaires, false),
        montant(l.marge, false),
        l.stock_disponible
      ]),
      totaux: [
        'Total',
        lignes.reduce((s, l) => s + l.quantite, 0),
        montant(lignes.reduce((s, l) => s + l.chiffreAffaires, 0), false),
        montant(lignes.reduce((s, l) => s + l.marge, 0), false),
        ''
      ]
    })
    return () => onSortie(null)
  }, [donnees.donnees, sens, onSortie])

  return (
    <Tableau
      colonnes={[
        {
          cle: 'produit',
          entete: 'Produit',
          rendu: (l) => (
            <CellulePrincipale
              titre={l.nom_commercial}
              sous={`${nombre(l.stock_disponible)} actuellement en stock`}
            />
          ),
          triSur: (l) => l.nom_commercial
        },
        {
          cle: 'quantite',
          entete: 'Quantité vendue',
          nombre: true,
          rendu: (l) => <strong>{nombre(l.quantite)}</strong>,
          triSur: (l) => l.quantite
        },
        {
          cle: 'ca',
          entete: 'Chiffre d’affaires',
          nombre: true,
          rendu: (l) => montant(l.chiffreAffaires),
          triSur: (l) => l.chiffreAffaires
        },
        {
          cle: 'marge',
          entete: 'Marge',
          nombre: true,
          rendu: (l) => montant(l.marge),
          triSur: (l) => l.marge
        },
        {
          cle: 'part',
          entete: 'Volume',
          largeur: '200px',
          rendu: (l) => (
            <div className="jauge">
              <div className="jauge-remplissage" style={{ width: `${(l.quantite / maximum) * 100}%` }} />
            </div>
          )
        }
      ]}
      lignes={lignes}
      cle={(l) => l.produit_id}
      chargement={donnees.chargement}
      erreur={donnees.erreur}
      onReessayer={donnees.recharger}
      parPage={30}
      resume={(n) => `${n} produit${n > 1 ? 's' : ''}`}
      outils={
        <Segments
          valeur={sens}
          options={[
            { valeur: 'meilleures', libelle: 'Meilleures ventes' },
            { valeur: 'faibles', libelle: 'Produits peu vendus' }
          ]}
          onChange={setSens}
        />
      }
      vide={
        <EtatVide icone="rapport" titre="Aucun produit vendu sur cette période">
          Les classements apparaîtront dès les premières ventes.
        </EtatVide>
      }
    />
  )
}

function RapportStock({ onSortie }: { onSortie: (s: SortieRapport | null) => void }) {
  const donnees = useRequete<{
    valeurTotale: number
    nbReferences: number
    nbLots: number
    parCategorie: { categorie: string; references: number; valeur: number }[]
  }>('rapports.stock')

  const d = donnees.donnees
  const maximum = Math.max(1, ...(d?.parCategorie ?? []).map((c) => c.valeur))

  useEffect(() => {
    onSortie({
      titre: 'Valeur du stock',
      colonnes: [
        { entete: 'Catégorie' },
        { entete: 'Références', droite: true },
        { entete: 'Valeur au prix d achat', droite: true }
      ],
      lignes: (d?.parCategorie ?? []).map((c) => [c.categorie, c.references, montant(c.valeur, false)]),
      totaux: ['Total', d?.nbReferences ?? 0, montant(d?.valeurTotale ?? 0, false)]
    })
    return () => onSortie(null)
  }, [d, onSortie])

  return (
    <>
      <div className="indicateurs">
        <Indicateur libelle="Valeur totale du stock" valeur={montant(d?.valeurTotale ?? 0)} />
        <Indicateur libelle="Références actives" valeur={nombre(d?.nbReferences ?? 0)} />
        <Indicateur libelle="Lots en stock" valeur={nombre(d?.nbLots ?? 0)} />
      </div>

      <Tableau
        colonnes={[
          { cle: 'categorie', entete: 'Catégorie', rendu: (c) => c.categorie, triSur: (c) => c.categorie },
          {
            cle: 'refs',
            entete: 'Références',
            nombre: true,
            rendu: (c) => nombre(c.references),
            triSur: (c) => c.references
          },
          {
            cle: 'valeur',
            entete: 'Valeur au prix d’achat',
            nombre: true,
            rendu: (c) => <strong>{montant(c.valeur)}</strong>,
            triSur: (c) => c.valeur
          },
          {
            cle: 'part',
            entete: 'Part du stock',
            largeur: '240px',
            rendu: (c) => (
              <div className="jauge">
                <div className="jauge-remplissage" style={{ width: `${(c.valeur / maximum) * 100}%` }} />
              </div>
            )
          }
        ]}
        lignes={d?.parCategorie ?? null}
        cle={(c) => c.categorie}
        chargement={donnees.chargement}
        erreur={donnees.erreur}
        onReessayer={donnees.recharger}
        resume={(n) => `${n} catégorie${n > 1 ? 's' : ''}`}
        vide={
          <EtatVide icone="stock" titre="Aucun stock valorisé">
            Enregistrez une réception pour constituer votre stock.
          </EtatVide>
        }
      />
    </>
  )
}
