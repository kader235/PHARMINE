import { useState } from 'react'
import type { Utilisateur } from '@shared/types'
import { useRequete } from '../lib/hooks'
import { EntetePage, Etiquette, EtatVide, Liste, Segments } from '../ui/Composants'
import Tableau, { CellulePrincipale } from '../ui/Tableau'
import { dateCourte, decalerJours, depuis, heure } from '../lib/format'
import { aujourdhui } from '../lib/format'

interface EntreeJournal {
  id: number
  at: string
  action: string
  entite: string
  entite_id: number | null
  resume: string
  resultat: string
  utilisateur: string | null
}

const ENTITES = [
  { valeur: '', libelle: 'Toutes les entités' },
  { valeur: 'vente', libelle: 'Ventes' },
  { valeur: 'produit', libelle: 'Produits' },
  { valeur: 'achat', libelle: 'Achats' },
  { valeur: 'caisse', libelle: 'Caisse' },
  { valeur: 'lot', libelle: 'Lots' },
  { valeur: 'inventaire', libelle: 'Inventaires' },
  { valeur: 'client', libelle: 'Clients' },
  { valeur: 'fournisseur', libelle: 'Fournisseurs' },
  { valeur: 'depense', libelle: 'Dépenses' },
  { valeur: 'utilisateur', libelle: 'Utilisateurs' },
  { valeur: 'permission', libelle: 'Accès refusés' },
  { valeur: 'parametre', libelle: 'Paramètres' }
]

export default function Journal() {
  const [periode, setPeriode] = useState<'jour' | 'semaine' | 'mois' | 'tout'>('semaine')
  const [entite, setEntite] = useState('')
  const [utilisateurId, setUtilisateurId] = useState('')

  const utilisateurs = useRequete<Utilisateur[]>('utilisateurs.lister')

  const depuisDate = (() => {
    if (periode === 'tout') return undefined
    const fin = aujourdhui()
    if (periode === 'jour') return fin + 'T00:00:00.000Z'
    if (periode === 'semaine') return decalerJours(fin, -7) + 'T00:00:00.000Z'
    return decalerJours(fin, -30) + 'T00:00:00.000Z'
  })()

  const entrees = useRequete<EntreeJournal[]>('journal.lister', {
    depuis: depuisDate,
    entite: entite || undefined,
    utilisateurId: utilisateurId ? Number(utilisateurId) : undefined,
    limite: 500
  })

  return (
    <>
      <EntetePage
        titre="Journal d’activité"
        description="La trace complète des opérations importantes. Ce journal ne peut être ni modifié ni effacé."
      />

      <Tableau
        colonnes={[
          {
            cle: 'at',
            entete: 'Date',
            largeur: '150px',
            rendu: (e: EntreeJournal) => (
              <CellulePrincipale titre={depuis(e.at)} sous={`${dateCourte(e.at)} ${heure(e.at)}`} />
            ),
            triSur: (e: EntreeJournal) => e.at
          },
          {
            cle: 'action',
            entete: 'Opération',
            largeur: '210px',
            rendu: (e: EntreeJournal) => <strong style={{ fontWeight: 500 }}>{e.action}</strong>,
            triSur: (e: EntreeJournal) => e.action
          },
          {
            cle: 'resume',
            entete: 'Détail',
            rendu: (e: EntreeJournal) => <span style={{ color: 'var(--texte-attenue)' }}>{e.resume}</span>
          },
          {
            cle: 'entite',
            entete: 'Entité',
            largeur: '130px',
            rendu: (e: EntreeJournal) => (
              <Etiquette ton="neutre" sansPoint>
                {e.entite}
              </Etiquette>
            ),
            triSur: (e: EntreeJournal) => e.entite
          },
          {
            cle: 'utilisateur',
            entete: 'Utilisateur',
            largeur: '160px',
            rendu: (e: EntreeJournal) => e.utilisateur ?? <span style={{ color: 'var(--texte-faible)' }}>Système</span>,
            triSur: (e: EntreeJournal) => e.utilisateur ?? ''
          },
          {
            cle: 'resultat',
            entete: 'Résultat',
            largeur: '110px',
            rendu: (e: EntreeJournal) =>
              e.resultat === 'succes' ? (
                <Etiquette ton="succes">Succès</Etiquette>
              ) : e.resultat === 'refuse' ? (
                <Etiquette ton="attention">Refusé</Etiquette>
              ) : (
                <Etiquette ton="danger">Échec</Etiquette>
              )
          }
        ]}
        lignes={entrees.donnees}
        cle={(e) => e.id}
        chargement={entrees.chargement}
        erreur={entrees.erreur}
        onReessayer={entrees.recharger}
        parPage={40}
        filtreActif={entite !== '' || utilisateurId !== '' || periode !== 'tout'}
        resume={(n) => `${n} entrée${n > 1 ? 's' : ''}`}
        outils={
          <>
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
            <div style={{ width: 190 }}>
              <Liste
                libelle=""
                options={ENTITES.map((e) => ({ valeur: e.valeur, libelle: e.libelle }))}
                value={entite}
                onChange={(e) => setEntite(e.target.value)}
                aria-label="Filtrer par entité"
              />
            </div>
            <div style={{ width: 190 }}>
              <Liste
                libelle=""
                vide="Tous les utilisateurs"
                options={(utilisateurs.donnees ?? []).map((u) => ({ valeur: u.id, libelle: u.nom_complet }))}
                value={utilisateurId}
                onChange={(e) => setUtilisateurId(e.target.value)}
                aria-label="Filtrer par utilisateur"
              />
            </div>
          </>
        }
        vide={
          <EtatVide icone="journal" titre="Aucune opération enregistrée">
            Connexions, ventes, ajustements de stock et changements de prix apparaîtront ici.
          </EtatVide>
        }
        videApresFiltre={
          <EtatVide icone="filtre" titre="Aucune opération ne correspond">
            Élargissez la période ou changez de filtre.
          </EtatVide>
        }
      />
    </>
  )
}
