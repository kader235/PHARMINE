import type { TableauDeBord as DonneesTableau } from '@shared/types'
import { useRequete } from '../lib/hooks'
import { useSession } from '../app/Session'
import { useFonctions } from '../app/fonctions'
import { useNavigation } from '../app/navigation'
import Icone, { type NomIcone } from '../ui/Icone'
import { Classement, Evolution, Repartition } from '../ui/Graphiques'
import {
  BandeauModule,
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
import { dateCourte, dateLongue, depuis, modePaiement, montant, nombre } from '../lib/format'

export default function TableauDeBord() {
  const session = useSession()
  const naviguer = useNavigation()
  const { donnees, chargement, erreur, recharger } = useRequete<DonneesTableau>('pilotage.tableauDeBord')

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

  const jour = dateLongue(donnees.date)
  const premiereMajuscule = jour.charAt(0).toUpperCase() + jour.slice(1)

  // Base vide : on accompagne au lieu d'afficher des indicateurs à zéro sans
  // explication. C'est le premier écran que verra un nouveau client.
  if (donnees.aucuneDonnee) {
    return (
      <>
        <EntetePage titre="Tableau de bord" description={premiereMajuscule} />
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

  const surveillance: {
    ton: Ton
    icone: NomIcone
    titre: string
    detail: string
    valeur: string
    action: () => void
    visible: boolean
  }[] = [
    {
      ton: 'danger',
      icone: 'boite-vide',
      titre: 'Produits en rupture',
      detail: 'À réapprovisionner en priorité',
      valeur: `${s.ruptures}`,
      action: () => naviguer({ module: 'stock', filtre: 'rupture' }),
      visible: s.ruptures > 0
    },
    {
      ton: 'danger',
      icone: 'peremption',
      titre: 'Lots périmés en rayon',
      detail: `${montant(s.valeurExpiree)} de valeur concernée`,
      valeur: `${s.expires}`,
      action: () => naviguer({ module: 'peremptions', filtre: 'expire' }),
      visible: s.expires > 0
    },
    {
      ton: 'attention',
      icone: 'stock',
      titre: 'Stock faible',
      detail: 'Sous le seuil minimum',
      valeur: `${s.stockFaible}`,
      action: () => naviguer({ module: 'stock', filtre: 'faible' }),
      visible: s.stockFaible > 0
    },
    {
      ton: 'attention',
      icone: 'horloge',
      titre: 'Péremptions proches',
      detail: 'Lots à écouler en priorité',
      valeur: `${s.peremptionProche}`,
      action: () => naviguer({ module: 'peremptions' }),
      visible: s.peremptionProche > 0
    },
    {
      ton: 'info',
      icone: 'fournisseur',
      titre: 'Dettes fournisseurs',
      detail: 'Restant dû sur les réceptions',
      valeur: montant(s.dettesFournisseurs),
      action: () => naviguer({ module: 'fournisseurs' }),
      visible: s.dettesFournisseurs > 0
    },
    {
      ton: 'info',
      icone: 'client',
      titre: 'Créances clients',
      detail: 'Ventes à crédit non réglées',
      valeur: montant(s.creancesClients),
      action: () => naviguer({ module: 'clients' }),
      visible: s.creancesClients > 0
    }
  ]

  const aSurveiller = surveillance.filter((e) => e.visible)

  return (
    <>
      <BandeauModule
        titre={session.pharmacie.nom}
        description={premiereMajuscule}
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

      <div className="indicateurs">
        <Indicateur
          libelle="Chiffre d’affaires"
          valeur={montant(donnees.chiffreAffaires.valeur)}
          variation={donnees.chiffreAffaires.variation}
        />
        <Indicateur
          libelle="Ventes"
          valeur={nombre(donnees.nbVentes.valeur)}
          unite={donnees.nbVentes.valeur > 1 ? 'ventes' : 'vente'}
          variation={donnees.nbVentes.variation}
        />
        <Indicateur
          libelle="Bénéfice estimé"
          valeur={montant(donnees.beneficeEstime.valeur)}
          variation={donnees.beneficeEstime.variation}
        />
        <Indicateur
          libelle="Dépenses"
          valeur={montant(donnees.depenses.valeur)}
          variation={donnees.depenses.variation}
        />
        <Indicateur
          libelle="Caisse"
          valeur={donnees.caisse.ouverte ? montant(donnees.caisse.theorique) : 'Fermée'}
          ton={donnees.caisse.ouverte ? undefined : 'danger'}
        />
      </div>

      <div className="grille-pilotage">
        <Panneau titre="Chiffre d’affaires — 14 derniers jours">
          <Evolution
            donnees={donnees.evolution.map((e) => ({ libelle: e.jour, valeur: e.chiffreAffaires }))}
            formatValeur={(v) => montant(v)}
            // Une date sur trois : au-delà, les libellés se chevauchent.
            formatLibelle={(jour, i) =>
              i % 3 === 0 || i === donnees.evolution.length - 1 ? dateCourte(jour).slice(0, 5) : ''
            }
          />
        </Panneau>

        <Panneau titre="Règlements du jour">
          <Repartition
            parts={donnees.reglements.map((r) => ({ libelle: modePaiement(r.mode), valeur: r.montant }))}
            formatValeur={(v) => montant(v)}
          />
        </Panneau>
      </div>

      <div className="grille-pilotage">
        <Panneau titre="À surveiller" sansCorps>
          {aSurveiller.length === 0 ? (
            <EtatVide icone="coche" titre="Rien à signaler">
              Aucune rupture, aucun lot périmé, aucune dette en cours. Votre pharmacie est à jour.
            </EtatVide>
          ) : (
            <div>
              {aSurveiller.map((element) => (
                <button key={element.titre} className="alerte-ligne" onClick={element.action}>
                  <span className={`alerte-marque ${element.ton === 'danger' ? 'urgent' : element.ton === 'attention' ? 'important' : 'information'}`}>
                    <Icone nom={element.icone} taille={14} />
                  </span>
                  <span className="alerte-texte">
                    <strong>{element.titre}</strong>
                    <span>{element.detail}</span>
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

        <div className="pile">
          <Panneau titre="Meilleures ventes — 7 jours">
            <Classement
              donnees={donnees.meilleuresVentes.map((v) => ({
                libelle: v.nom,
                valeur: v.quantite,
                complement: montant(v.montant)
              }))}
              formatValeur={(v) => `${nombre(v)}`}
            />
          </Panneau>

          <Panneau titre="Actions rapides">
            <div className="pile" style={{ gap: 6 }}>
              {session.peut('ventes.creer') ? (
                <Bouton icone="vente" pleine onClick={() => naviguer({ module: 'ventes' })}>
                  Enregistrer une vente
                </Bouton>
              ) : null}
              {session.peut('achats.valider') ? (
                <Bouton icone="achat" pleine onClick={() => naviguer({ module: 'achats', filtre: 'nouveau' })}>
                  Enregistrer une réception
                </Bouton>
              ) : null}
              {session.peut('produits.creer') ? (
                <Bouton icone="produit" pleine onClick={() => naviguer({ module: 'produits', filtre: 'nouveau' })}>
                  Ajouter un produit
                </Bouton>
              ) : null}
              {session.peut('inventaire.creer') ? (
                <Bouton icone="inventaire" pleine onClick={() => naviguer({ module: 'inventaire' })}>
                  Faire un inventaire
                </Bouton>
              ) : null}
              {!donnees.caisse.ouverte && session.peut('caisse.ouvrir') ? (
                <Bouton icone="caisse" pleine variante="principal" onClick={() => naviguer({ module: 'caisse' })}>
                  Ouvrir la caisse
                </Bouton>
              ) : null}
            </div>
          </Panneau>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <Panneau titre="Dernières opérations" sansCorps>
          {donnees.activite.length === 0 ? (
            <EtatVide icone="journal" titre="Aucune opération pour le moment">
              Les ventes, réceptions et dépenses apparaîtront ici dès qu’elles seront enregistrées.
            </EtatVide>
          ) : (
            <div className="tableau-defilement">
              <table className="tableau">
                <thead>
                  <tr>
                    <th style={{ width: 130 }}>Opération</th>
                    <th>Référence</th>
                    <th>Détail</th>
                    <th className="cellule-nombre">Montant</th>
                    <th style={{ width: 150 }}>Utilisateur</th>
                    <th style={{ width: 120 }}>Quand</th>
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
                          <span style={ligne.montant < 0 ? { color: 'var(--danger)' } : undefined}>
                            {montant(ligne.montant)}
                          </span>
                        )}
                      </td>
                      <td style={{ color: 'var(--texte-attenue)' }}>{ligne.utilisateur ?? '—'}</td>
                      <td style={{ color: 'var(--texte-faible)' }}>{depuis(ligne.at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panneau>
      </div>

      {chargement ? null : null}
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
