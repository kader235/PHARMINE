import type { TableauDeBord as DonneesTableau } from '@shared/types'
import { useRequete } from '../lib/hooks'
import { useSession } from '../app/Session'
import { useFonctions } from '../app/fonctions'
import { useNavigation } from '../app/navigation'
import Icone, { type NomIcone } from '../ui/Icone'
import { Classement, Repartition } from '../ui/Graphiques'
import {
  Bouton,
  Chargement,
  EntetePage,
  ErreurEcran,
  EtatVide,
  Etiquette,
  Indicateur,
  Panneau,
  type Ton
} from '../ui/Composants'
import { depuis, modePaiement, montant, nombre, pourcentage } from '../lib/format'

/**
 * Tableau de bord.
 *
 * Une seule règle de mise en page : tout tient dans l'écran. Un tableau de
 * bord qu'il faut faire défiler ne remplit pas son office — on l'ouvre pour
 * savoir où on en est d'un coup d'œil, pas pour lire un rapport.
 *
 * Chaque panneau défile donc à l'intérieur de ses propres bords, et la page
 * elle-même ne bouge pas.
 */
export default function TableauDeBord() {
  const session = useSession()
  const naviguer = useNavigation()
  const { donnees, erreur, recharger } = useRequete<DonneesTableau>('pilotage.tableauDeBord')

  useFonctions('tableau-bord', [
    {
      touche: 'F2',
      libelle: 'Nouvelle vente',
      action: () => naviguer({ module: 'ventes' }),
      disponible: session.peut('ventes.creer'),
      saillante: true
    },
    {
      touche: 'F3',
      libelle: 'Enregistrer une réception',
      action: () => naviguer({ module: 'achats', filtre: 'nouveau' }),
      disponible: session.peut('achats.valider')
    },
    {
      touche: 'F4',
      libelle: 'Ajouter un produit',
      action: () => naviguer({ module: 'produits', filtre: 'nouveau' }),
      disponible: session.peut('produits.creer')
    },
    { touche: 'F5', libelle: 'Actualiser', action: recharger }
  ])

  if (erreur) return <ErreurEcran erreur={erreur} onReessayer={recharger} />
  if (!donnees) return <Chargement libelle="Préparation du tableau de bord…" />

  // Base vide : on accompagne au lieu d'afficher des indicateurs à zéro sans
  // explication. C'est le premier écran que verra un nouveau client.
  if (donnees.aucuneDonnee) {
    return (
      <>
        <EntetePage titre="Tableau de bord" />
        <Panneau>
          <EtatVide icone="produit" titre="Votre pharmacie est prête à être renseignée">
            Aucun produit n’est encore enregistré. Commencez par constituer votre catalogue, puis
            enregistrez une première réception pour alimenter le stock. Le tableau de bord se
            remplira au fil de votre activité.
          </EtatVide>
          <div className="rangee" style={{ justifyContent: 'center', paddingBottom: 8 }}>
            {session.peut('produits.creer') ? (
              <Bouton variante="principal" icone="plus" onClick={() => naviguer({ module: 'produits', filtre: 'nouveau' })}>
                Ajouter un produit
              </Bouton>
            ) : null}
            {session.peut('achats.valider') ? (
              <Bouton icone="achat" onClick={() => naviguer({ module: 'achats', filtre: 'nouveau' })}>
                Enregistrer une réception
              </Bouton>
            ) : null}
          </div>
        </Panneau>
      </>
    )
  }

  const s = donnees.surveillance
  const j = donnees.journee

  const surveillance: {
    ton: Ton
    icone: NomIcone
    titre: string
    valeur: string
    action: () => void
    visible: boolean
  }[] = [
    {
      ton: 'danger',
      icone: 'boite-vide',
      titre: 'Produits en rupture',
      valeur: `${s.ruptures}`,
      action: () => naviguer({ module: 'stock', filtre: 'rupture' }),
      visible: s.ruptures > 0
    },
    {
      ton: 'danger',
      icone: 'peremption',
      titre: 'Lots périmés en rayon',
      valeur: `${s.expires}`,
      action: () => naviguer({ module: 'peremptions', filtre: 'expire' }),
      visible: s.expires > 0
    },
    {
      ton: 'attention',
      icone: 'stock',
      titre: 'Stock faible',
      valeur: `${s.stockFaible}`,
      action: () => naviguer({ module: 'stock', filtre: 'faible' }),
      visible: s.stockFaible > 0
    },
    {
      ton: 'attention',
      icone: 'horloge',
      titre: 'Péremptions proches',
      valeur: `${s.peremptionProche}`,
      action: () => naviguer({ module: 'peremptions' }),
      visible: s.peremptionProche > 0
    },
    {
      ton: 'danger',
      icone: 'caisse',
      titre: 'Caisse fermée',
      valeur: 'Ouvrir',
      action: () => naviguer({ module: 'caisse' }),
      visible: !donnees.caisse.ouverte && session.peut('caisse.ouvrir')
    },
    {
      // En tête des alertes techniques : c'est la seule dont la conséquence
      // est irréversible.
      ton: 'danger',
      icone: 'sauvegarde',
      titre: donnees.sauvegarde.configuree
        ? donnees.sauvegarde.accessible
          ? 'Sauvegarde non copiée hors du poste'
          : 'Destination de sauvegarde injoignable'
        : 'Sauvegardes non protégées',
      valeur: 'Régler',
      action: () => naviguer({ module: 'parametres' }),
      visible: donnees.sauvegarde.enRetard && session.peut('parametres.voir')
    },
    {
      ton: 'info',
      icone: 'fournisseur',
      titre: 'Dettes fournisseurs',
      valeur: montant(s.dettesFournisseurs),
      action: () => naviguer({ module: 'fournisseurs' }),
      visible: s.dettesFournisseurs > 0
    },
    {
      ton: 'info',
      icone: 'client',
      titre: 'Créances clients',
      valeur: montant(s.creancesClients),
      action: () => naviguer({ module: 'clients' }),
      visible: s.creancesClients > 0
    }
  ]

  const aSurveiller = surveillance.filter((e) => e.visible)
  const ecart = donnees.chiffreAffaires.variation

  return (
    <>
      <EntetePage
        titre="Tableau de bord"
        actions={
          session.peut('ventes.creer') ? (
            <Bouton
              variante="principal"
              icone="vente"
              title="Raccourci : F2"
              onClick={() => naviguer({ module: 'ventes' })}
            >
              Nouvelle vente
            </Bouton>
          ) : null
        }
      />

      <div className="indicateurs bande">
        <Indicateur libelle="Chiffre d’affaires" valeur={montant(donnees.chiffreAffaires.valeur)} />
        <Indicateur
          libelle="Ventes"
          valeur={nombre(donnees.nbVentes.valeur)}
          unite={donnees.nbVentes.valeur > 1 ? 'ventes' : 'vente'}
        />
        <Indicateur libelle="Bénéfice estimé" valeur={montant(donnees.beneficeEstime.valeur)} />
        <Indicateur libelle="Dépenses" valeur={montant(donnees.depenses.valeur)} />
        <Indicateur
          libelle="Caisse"
          valeur={donnees.caisse.ouverte ? montant(donnees.caisse.theorique) : 'Fermée'}
        />
      </div>

      <div className="pilotage">
        <Panneau titre="Points d’attention" sansCorps>
          {aSurveiller.length === 0 ? (
            <EtatVide icone="coche" titre="Rien à signaler">
              Aucune rupture, aucun lot périmé, aucune dette en cours.
            </EtatVide>
          ) : (
            <div>
              {aSurveiller.map((element) => (
                <button key={element.titre} className="alerte-ligne" onClick={element.action}>
                  <span
                    className={`alerte-marque ${
                      element.ton === 'danger'
                        ? 'urgent'
                        : element.ton === 'attention'
                          ? 'important'
                          : 'information'
                    }`}
                  >
                    <Icone nom={element.icone} taille={14} />
                  </span>
                  <span className="alerte-texte">
                    <strong>{element.titre}</strong>
                  </span>
                  <Etiquette ton={element.ton} sansPoint>
                    {element.valeur}
                  </Etiquette>
                  <Icone nom="chevron-droit" taille={13} />
                </button>
              ))}
            </div>
          )}
        </Panneau>

        {/* Ce panneau remplace la courbe de chiffre d'affaires. Une courbe
            montrait la forme des quatorze derniers jours ; ces cinq lignes
            répondent aux questions qu'on se pose vraiment le matin. */}
        <Panneau titre="La journée">
          <dl className="faits">
            <div>
              <dt>Panier moyen</dt>
              <dd>{montant(j.panierMoyen)}</dd>
            </div>
            <div>
              <dt>Articles vendus</dt>
              <dd>{nombre(j.articles)}</dd>
            </div>
            <div>
              <dt>Ventes à crédit</dt>
              <dd>
                {j.ventesCredit === 0
                  ? 'Aucune'
                  : `${nombre(j.ventesCredit)} · ${montant(j.montantCredit)}`}
              </dd>
            </div>
            <div className="faits-coupure" />
            <div>
              <dt>Hier</dt>
              <dd>{montant(j.chiffreHier)}</dd>
            </div>
            <div>
              <dt>Moyenne 7 jours</dt>
              <dd>{montant(j.moyenneSeptJours)}</dd>
            </div>
            {ecart !== null ? (
              <div>
                <dt>Écart sur hier</dt>
                <dd>
                  {ecart >= 0 ? '+' : ''}
                  {pourcentage(ecart)}
                </dd>
              </div>
            ) : null}
          </dl>
        </Panneau>

        <Panneau titre="Meilleures ventes — 7 jours">
          {donnees.meilleuresVentes.length === 0 ? (
            <EtatVide icone="vente" titre="Aucune vente cette semaine" />
          ) : (
            <Classement
              donnees={donnees.meilleuresVentes.map((v) => ({ libelle: v.nom, valeur: v.quantite }))}
              formatValeur={(v) => `${nombre(v)}`}
            />
          )}
        </Panneau>

        <Panneau titre="Dernières opérations" sansCorps className="pilotage-large">
          {donnees.activite.length === 0 ? (
            <EtatVide icone="journal" titre="Aucune opération pour le moment">
              Les ventes, réceptions et dépenses apparaîtront ici dès qu’elles seront enregistrées.
            </EtatVide>
          ) : (
            <table className="tableau">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Opération</th>
                  <th>Référence</th>
                  <th>Détail</th>
                  <th className="cellule-nombre">Montant</th>
                  <th style={{ width: 140 }}>Utilisateur</th>
                  <th style={{ width: 100 }}>Quand</th>
                </tr>
              </thead>
              <tbody>
                {donnees.activite.map((ligne, index) => (
                  <tr key={`${ligne.type}-${ligne.libelle}-${index}`}>
                    <td>
                      <Etiquette ton={tonActivite(ligne.type)}>{libelleActivite(ligne.type)}</Etiquette>
                    </td>
                    <td style={{ fontWeight: 500 }}>{ligne.libelle}</td>
                    <td style={{ color: 'var(--texte-attenue)' }}>{ligne.detail}</td>
                    <td className="cellule-nombre">
                      {ligne.montant === null ? (
                        '—'
                      ) : (
                        <span>{montant(ligne.montant)}</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--texte-attenue)' }}>{ligne.utilisateur ?? '—'}</td>
                    <td style={{ color: 'var(--texte-faible)' }}>{depuis(ligne.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panneau>

        <Panneau titre="Règlements du jour">
          {donnees.reglements.length === 0 ? (
            <EtatVide icone="caisse" titre="Aucun encaissement" />
          ) : (
            <Repartition
              parts={donnees.reglements.map((r) => ({
                libelle: modePaiement(r.mode),
                valeur: r.montant
              }))}
              formatValeur={(v) => montant(v)}
            />
          )}
        </Panneau>
      </div>
    </>
  )
}

function tonActivite(type: string): Ton {
  if (type === 'vente') return 'succes'
  if (type === 'achat') return 'info'
  if (type === 'depense') return 'attention'
  return 'neutre'
}

function libelleActivite(type: string): string {
  const libelles: Record<string, string> = {
    vente: 'Vente',
    achat: 'Réception',
    depense: 'Dépense',
    inventaire: 'Inventaire'
  }
  return libelles[type] ?? type
}
