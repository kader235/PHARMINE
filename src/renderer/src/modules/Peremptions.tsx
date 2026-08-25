import { useEffect, useState } from 'react'
import type { LotPeremption, PalierPeremption } from '@shared/types'
import { useAction, useRequete } from '../lib/hooks'
import { useSession } from '../app/Session'
import { useFonctions } from '../app/fonctions'
import type { Destination } from '../app/navigation'
import { useNotifications } from '../ui/Notifications'
import {
  Bandeau,
  Bouton,
  EntetePage,
  Etiquette,
  EtatVide,
  Indicateur,
  Modale,
  Segments,
  ZoneTexte,
  type Ton
} from '../ui/Composants'
import Tableau, { CellulePrincipale, RechercheTableau } from '../ui/Tableau'
import { dateCourte, montant, nombre } from '../lib/format'

const PALIERS: { valeur: PalierPeremption | 'tous'; libelle: string }[] = [
  { valeur: 'tous', libelle: 'Tous les lots à surveiller' },
  { valeur: 'expire', libelle: 'Déjà périmés' },
  { valeur: 'j7', libelle: 'Moins de 7 jours' },
  { valeur: 'j30', libelle: 'Moins de 30 jours' },
  { valeur: 'j90', libelle: 'Moins de 90 jours' }
]

const TONS: Record<PalierPeremption, Ton> = {
  expire: 'danger',
  j7: 'danger',
  j30: 'attention',
  j90: 'attention',
  ok: 'succes'
}

const LIBELLES: Record<PalierPeremption, string> = {
  expire: 'Périmé',
  j7: 'Moins de 7 j',
  j30: 'Moins de 30 j',
  j90: 'Moins de 90 j',
  ok: 'Valide'
}

export default function Peremptions({ destination }: { destination: Destination }) {
  const session = useSession()
  const notifications = useNotifications()
  const [palier, setPalier] = useState<PalierPeremption | 'tous'>('tous')
  const [recherche, setRecherche] = useState('')
  const [retrait, setRetrait] = useState<LotPeremption | null>(null)

  useEffect(() => {
    if (destination.filtre === 'expire') setPalier('expire')
  }, [destination])

  const lots = useRequete<LotPeremption[]>('stock.peremptions')
  const resume = useRequete<Record<PalierPeremption, { lots: number; valeur: number }>>(
    'stock.resumePeremptions'
  )

  useFonctions('peremptions', [
    {
      touche: 'F5',
      libelle: 'Actualiser',
      action: () => {
        lots.recharger()
        resume.recharger()
      }
    },
    {
      touche: 'F7',
      libelle: 'Lots périmés',
      action: () => setPalier((p) => (p === 'expire' ? 'tous' : 'expire'))
    },
    {
      touche: 'F8',
      libelle: 'Moins de 30 jours',
      action: () => setPalier((p) => (p === 'j30' ? 'tous' : 'j30'))
    }
  ])

  const filtres = (lots.donnees ?? []).filter(
    (l) =>
      (palier === 'tous' || l.palier === palier) &&
      (!recherche.trim() || l.nom_commercial.toLowerCase().includes(recherche.trim().toLowerCase()))
  )

  const r = resume.donnees

  return (
    <>
      <EntetePage
        titre="Péremptions"
      />

      <div className="indicateurs">
        <Indicateur
          libelle="Lots déjà périmés"
          valeur={nombre(r?.expire.lots ?? 0)}
          ton={(r?.expire.lots ?? 0) > 0 ? 'danger' : undefined}
        />
        <Indicateur
          libelle="Expire sous 7 jours"
          valeur={nombre(r?.j7.lots ?? 0)}
        />
        <Indicateur
          libelle="Expire sous 30 jours"
          valeur={nombre(r?.j30.lots ?? 0)}
        />
        <Indicateur
          libelle="Expire sous 90 jours"
          valeur={nombre(r?.j90.lots ?? 0)}
        />
      </div>

      {(r?.expire.lots ?? 0) > 0 ? (
        <div style={{ marginBottom: 12 }}>
          <Bandeau ton="danger" titre={`${r!.expire.lots} lot(s) périmé(s) encore en rayon`}>
            Ces unités sont automatiquement écartées de la vente, mais elles restent physiquement
            présentes. Retirez-les du rayon et enregistrez la sortie pour que le stock reflète la
            réalité.
          </Bandeau>
        </div>
      ) : null}

      <Tableau
        colonnes={[
          {
            cle: 'produit',
            entete: 'Produit',
            triSur: (l: LotPeremption) => l.nom_commercial,
            rendu: (l: LotPeremption) => (
              <CellulePrincipale
                titre={`${l.nom_commercial} ${l.dosage ?? ''}`}
                sous={[l.numero ? `Lot ${l.numero}` : 'Sans numéro de lot', l.emplacement]
                  .filter(Boolean)
                  .join(' · ')}
              />
            )
          },
          {
            cle: 'peremption',
            entete: 'Péremption',
            largeur: '130px',
            rendu: (l: LotPeremption) => dateCourte(l.date_peremption),
            triSur: (l: LotPeremption) => l.date_peremption
          },
          {
            cle: 'jours',
            entete: 'Échéance',
            nombre: true,
            rendu: (l: LotPeremption) =>
              l.jours_restants < 0 ? (
                <span style={{ color: 'var(--danger)' }}>
                  périmé depuis {nombre(-l.jours_restants)} j
                </span>
              ) : (
                `dans ${nombre(l.jours_restants)} j`
              ),
            triSur: (l: LotPeremption) => l.jours_restants
          },
          {
            cle: 'quantite',
            entete: 'Quantité',
            nombre: true,
            rendu: (l: LotPeremption) => <strong>{nombre(l.quantite_restante)}</strong>,
            triSur: (l: LotPeremption) => l.quantite_restante
          },
          {
            cle: 'valeur',
            entete: 'Valeur',
            nombre: true,
            rendu: (l: LotPeremption) => montant(l.valeur),
            triSur: (l: LotPeremption) => l.valeur
          },
          {
            cle: 'palier',
            entete: 'Palier',
            largeur: '130px',
            rendu: (l: LotPeremption) => <Etiquette ton={TONS[l.palier]}>{LIBELLES[l.palier]}</Etiquette>,
            triSur: (l: LotPeremption) => l.jours_restants
          },
          {
            cle: 'actions',
            entete: '',
            actions: true,
            largeur: '110px',
            rendu: (l: LotPeremption) =>
              session.peut('stock.sortie') ? (
                <Bouton compact variante="discret" onClick={() => setRetrait(l)}>
                  Retirer
                </Bouton>
              ) : null
          }
        ]}
        lignes={filtres}
        cle={(l) => l.lot_id}
        chargement={lots.chargement}
        erreur={lots.erreur}
        onReessayer={lots.recharger}
        parPage={30}
        triInitial={{ cle: 'peremption', sens: 'asc' }}
        filtreActif={palier !== 'tous' || recherche.trim().length > 0}
        resume={(n) => `${n} lot${n > 1 ? 's' : ''} · ${montant(filtres.reduce((s, l) => s + l.valeur, 0))}`}
        outils={
          <>
            <RechercheTableau valeur={recherche} onChange={setRecherche} placeholder="Rechercher un produit…" />
            <Segments valeur={palier} options={PALIERS} onChange={setPalier} />
          </>
        }
        vide={
          <EtatVide icone="coche" titre="Aucun lot à surveiller">
            Aucun lot n’arrive à échéance dans les 90 prochains jours. Ce seuil est modifiable dans
            les paramètres.
          </EtatVide>
        }
        videApresFiltre={
          <EtatVide icone="coche" titre="Aucun lot dans ce palier">
            Rien à signaler pour cette échéance.
          </EtatVide>
        }
      />

      {retrait ? (
        <RetraitLot
          lot={retrait}
          onFermer={() => setRetrait(null)}
          onRetire={() => {
            setRetrait(null)
            lots.recharger()
            resume.recharger()
            notifications.succes('Lot retiré du stock')
          }}
        />
      ) : null}
    </>
  )
}

function RetraitLot({
  lot,
  onFermer,
  onRetire
}: {
  lot: LotPeremption
  onFermer: () => void
  onRetire: () => void
}) {
  const action = useAction()
  const [motif, setMotif] = useState(
    lot.palier === 'expire' ? `Retrait du lot ${lot.numero ?? ''} arrivé à péremption` : ''
  )

  async function retirer(): Promise<void> {
    const r = await action.executer('stock.sortie', {
      produitId: lot.produit_id,
      quantite: lot.quantite_restante,
      type: lot.palier === 'expire' ? 'peremption' : 'perte',
      motif: motif.trim()
    })
    if (r !== null) onRetire()
  }

  return (
    <Modale
      titre="Retirer ce lot du stock"
      description={`${lot.nom_commercial} — lot ${lot.numero ?? 'sans numéro'}, ${nombre(lot.quantite_restante)} unité(s)`}
      onFermer={onFermer}
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="danger" disabled={motif.trim().length < 3} enCours={action.enCours} onClick={retirer}>
            Retirer du stock
          </Bouton>
        </>
      }
    >
      <div className="panneau-corps pile">
        {action.erreur ? <Bandeau ton="danger">{action.erreur.message}</Bandeau> : null}
        <Bandeau ton="attention" titre={`${montant(lot.valeur)} sortiront du stock`}>
          Le mouvement sera enregistré au journal. Cette perte apparaîtra dans vos rapports de stock.
        </Bandeau>
        <ZoneTexte
          libelle="Motif du retrait"
          obligatoire
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
        />
      </div>
    </Modale>
  )
}
