import { useEffect, useState } from 'react'
import type { Fournisseur } from '@shared/types'
import { useAction, useRequete } from '../lib/hooks'
import { useSession } from '../app/Session'
import type { Destination } from '../app/navigation'
import { useNotifications } from '../ui/Notifications'
import {
  Bandeau,
  Bouton,
  Champ,
  Chargement,
  EntetePage,
  Etiquette,
  EtatVide,
  Modale,
  ZoneTexte
} from '../ui/Composants'
import Tableau, { CellulePrincipale, RechercheTableau } from '../ui/Tableau'
import { dateCourte, montant } from '../lib/format'

export default function Fournisseurs({ destination }: { destination: Destination }) {
  const session = useSession()
  const notifications = useNotifications()
  const [recherche, setRecherche] = useState('')
  const [edition, setEdition] = useState<{ fournisseur: Fournisseur | null } | null>(null)
  const [detail, setDetail] = useState<number | null>(null)

  useEffect(() => {
    if (destination.cible?.type === 'fournisseur') setDetail(destination.cible.id)
  }, [destination])

  const liste = useRequete<Fournisseur[]>('fournisseurs.lister', {
    recherche: recherche.trim() || undefined
  })

  return (
    <>
      <EntetePage
        titre="Fournisseurs"
        description="Vos partenaires, leurs conditions et les sommes restant dues."
        actions={
          session.peut('fournisseurs.gerer') ? (
            <Bouton variante="principal" icone="plus" onClick={() => setEdition({ fournisseur: null })}>
              Ajouter un fournisseur
            </Bouton>
          ) : null
        }
      />

      <Tableau
        colonnes={[
          {
            cle: 'nom',
            entete: 'Fournisseur',
            triSur: (f: Fournisseur) => f.nom,
            rendu: (f: Fournisseur) => (
              <CellulePrincipale
                titre={f.nom}
                sous={[f.code, f.contact_principal, f.ville].filter(Boolean).join(' · ')}
              />
            )
          },
          { cle: 'telephone', entete: 'Téléphone', rendu: (f: Fournisseur) => f.telephone ?? '—' },
          {
            cle: 'conditions',
            entete: 'Conditions',
            rendu: (f: Fournisseur) => f.conditions_paiement ?? '—'
          },
          {
            cle: 'dernier',
            entete: 'Dernier achat',
            rendu: (f: Fournisseur) => dateCourte(f.dernier_achat),
            triSur: (f: Fournisseur) => f.dernier_achat ?? ''
          },
          {
            cle: 'total',
            entete: 'Total acheté',
            nombre: true,
            rendu: (f: Fournisseur) => montant(f.total_achats ?? 0),
            triSur: (f: Fournisseur) => f.total_achats ?? 0
          },
          {
            cle: 'solde',
            entete: 'Restant dû',
            nombre: true,
            rendu: (f: Fournisseur) =>
              (f.solde_du ?? 0) > 0 ? (
                <Etiquette ton="attention">{montant(f.solde_du)}</Etiquette>
              ) : (
                <span style={{ color: 'var(--texte-faible)' }}>Soldé</span>
              ),
            triSur: (f: Fournisseur) => f.solde_du ?? 0
          }
        ]}
        lignes={liste.donnees}
        cle={(f) => f.id}
        chargement={liste.chargement}
        erreur={liste.erreur}
        onReessayer={liste.recharger}
        onLigneClic={(f) => setDetail(f.id)}
        parPage={25}
        filtreActif={recherche.trim().length > 0}
        resume={(n) =>
          `${n} fournisseur${n > 1 ? 's' : ''} · ${montant(
            (liste.donnees ?? []).reduce((s, f) => s + (f.solde_du ?? 0), 0)
          )} restant dus`
        }
        outils={<RechercheTableau valeur={recherche} onChange={setRecherche} placeholder="Nom, contact, téléphone…" />}
        vide={
          <EtatVide
            icone="fournisseur"
            titre="Aucun fournisseur enregistré"
            action={
              session.peut('fournisseurs.gerer') ? (
                <Bouton variante="principal" icone="plus" onClick={() => setEdition({ fournisseur: null })}>
                  Ajouter votre premier fournisseur
                </Bouton>
              ) : undefined
            }
          >
            Un fournisseur est nécessaire pour enregistrer une réception et suivre vos dettes.
          </EtatVide>
        }
        videApresFiltre={<EtatVide icone="recherche" titre="Aucun fournisseur ne correspond" />}
      />

      {edition ? (
        <FormulaireFournisseur
          fournisseur={edition.fournisseur}
          onFermer={() => setEdition(null)}
          onEnregistre={(nouveau) => {
            setEdition(null)
            liste.recharger()
            notifications.succes(nouveau ? 'Fournisseur créé' : 'Fournisseur modifié')
          }}
        />
      ) : null}

      {detail !== null ? (
        <FicheFournisseur
          id={detail}
          onFermer={() => setDetail(null)}
          onModifier={(f) => {
            setDetail(null)
            setEdition({ fournisseur: f })
          }}
        />
      ) : null}
    </>
  )
}

function FormulaireFournisseur({
  fournisseur,
  onFermer,
  onEnregistre
}: {
  fournisseur: Fournisseur | null
  onFermer: () => void
  onEnregistre: (nouveau: boolean) => void
}) {
  const action = useAction()
  const [d, setD] = useState({
    nom: fournisseur?.nom ?? '',
    contactPrincipal: fournisseur?.contact_principal ?? '',
    telephone: fournisseur?.telephone ?? '',
    email: fournisseur?.email ?? '',
    adresse: fournisseur?.adresse ?? '',
    ville: fournisseur?.ville ?? '',
    pays: fournisseur?.pays ?? '',
    conditionsPaiement: fournisseur?.conditions_paiement ?? '',
    delaiLivraisonJours: fournisseur?.delai_livraison_jours ?? null,
    notes: fournisseur?.notes ?? ''
  })

  async function enregistrer(): Promise<void> {
    const r = await action.executer('fournisseurs.enregistrer', {
      id: fournisseur?.id ?? null,
      donnees: {
        ...d,
        contactPrincipal: d.contactPrincipal.trim() || null,
        telephone: d.telephone.trim() || null,
        email: d.email.trim() || null,
        adresse: d.adresse.trim() || null,
        ville: d.ville.trim() || null,
        pays: d.pays.trim() || null,
        conditionsPaiement: d.conditionsPaiement.trim() || null,
        notes: d.notes.trim() || null
      }
    })
    if (r !== null) onEnregistre(!fournisseur)
  }

  return (
    <Modale
      titre={fournisseur ? `Modifier ${fournisseur.nom}` : 'Nouveau fournisseur'}
      onFermer={onFermer}
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton
            variante="principal"
            disabled={d.nom.trim().length < 2}
            enCours={action.enCours}
            onClick={enregistrer}
          >
            {fournisseur ? 'Enregistrer' : 'Créer le fournisseur'}
          </Bouton>
        </>
      }
    >
      <div className="panneau-corps pile">
        {action.erreur ? <Bandeau ton="danger">{action.erreur.message}</Bandeau> : null}
        <Champ libelle="Nom" obligatoire value={d.nom} onChange={(e) => setD({ ...d, nom: e.target.value })} />
        <div className="grille deux">
          <Champ
            libelle="Contact principal"
            value={d.contactPrincipal}
            onChange={(e) => setD({ ...d, contactPrincipal: e.target.value })}
          />
          <Champ libelle="Téléphone" value={d.telephone} onChange={(e) => setD({ ...d, telephone: e.target.value })} />
          <Champ
            libelle="Adresse électronique"
            type="email"
            value={d.email}
            onChange={(e) => setD({ ...d, email: e.target.value })}
          />
          <Champ libelle="Ville" value={d.ville} onChange={(e) => setD({ ...d, ville: e.target.value })} />
          <Champ
            libelle="Conditions de paiement"
            value={d.conditionsPaiement}
            onChange={(e) => setD({ ...d, conditionsPaiement: e.target.value })}
            placeholder="30 jours fin de mois"
          />
          <Champ
            libelle="Délai de livraison (jours)"
            type="number"
            min={0}
            value={d.delaiLivraisonJours ?? ''}
            onChange={(e) =>
              setD({ ...d, delaiLivraisonJours: e.target.value ? Number(e.target.value) : null })
            }
          />
        </div>
        <ZoneTexte libelle="Notes" value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
      </div>
    </Modale>
  )
}

function FicheFournisseur({
  id,
  onFermer,
  onModifier
}: {
  id: number
  onFermer: () => void
  onModifier: (f: Fournisseur) => void
}) {
  const session = useSession()
  const fiche = useRequete<Fournisseur & { produits: { id: number; nom: string; dernier_prix: number }[] }>(
    'fournisseurs.detail',
    { id }
  )

  if (!fiche.donnees) {
    return (
      <Modale titre="Fiche fournisseur" onFermer={onFermer}>
        <div className="panneau-corps">
          {fiche.erreur ? <Bandeau ton="danger">{fiche.erreur.message}</Bandeau> : <Chargement />}
        </div>
      </Modale>
    )
  }

  const f = fiche.donnees

  return (
    <Modale
      titre={f.nom}
      description={[f.code, f.ville, f.pays].filter(Boolean).join(' · ')}
      large
      onFermer={onFermer}
      pied={
        <>
          {session.peut('fournisseurs.gerer') ? (
            <Bouton icone="crayon" onClick={() => onModifier(f)}>
              Modifier
            </Bouton>
          ) : null}
          <Bouton variante="principal" onClick={onFermer}>
            Fermer
          </Bouton>
        </>
      }
    >
      <div className="panneau-corps">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <div className="formulaire-titre">Coordonnées</div>
            <dl className="liste-definitions">
              <dt>Contact</dt>
              <dd>{f.contact_principal ?? '—'}</dd>
              <dt>Téléphone</dt>
              <dd>{f.telephone ?? '—'}</dd>
              <dt>Courriel</dt>
              <dd>{f.email ?? '—'}</dd>
              <dt>Adresse</dt>
              <dd>{f.adresse ?? '—'}</dd>
              <dt>Conditions</dt>
              <dd>{f.conditions_paiement ?? '—'}</dd>
              <dt>Délai de livraison</dt>
              <dd>{f.delai_livraison_jours ? `${f.delai_livraison_jours} jours` : '—'}</dd>
            </dl>
          </div>
          <div>
            <div className="formulaire-titre">Comptes</div>
            <dl className="liste-definitions">
              <dt>Total acheté</dt>
              <dd>{montant(f.total_achats ?? 0)}</dd>
              <dt>Total réglé</dt>
              <dd>{montant(f.total_paye ?? 0)}</dd>
              <dt>Restant dû</dt>
              <dd
                style={{
                  fontWeight: 700,
                  color: (f.solde_du ?? 0) > 0 ? 'var(--attention)' : 'var(--succes)'
                }}
              >
                {montant(f.solde_du ?? 0)}
              </dd>
              <dt>Dernier achat</dt>
              <dd>{dateCourte(f.dernier_achat)}</dd>
            </dl>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div className="formulaire-titre">Produits livrés par ce fournisseur</div>
          {f.produits.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--texte-faible)' }}>
              Aucune réception enregistrée pour ce fournisseur.
            </p>
          ) : (
            <table className="tableau">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th className="cellule-nombre">Dernier prix d’achat</th>
                </tr>
              </thead>
              <tbody>
                {f.produits.map((p) => (
                  <tr key={p.id}>
                    <td>{p.nom}</td>
                    <td className="cellule-nombre">{montant(p.dernier_prix)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {f.notes ? (
          <div style={{ marginTop: 16 }}>
            <div className="formulaire-titre">Notes</div>
            <p style={{ fontSize: 12.5, color: 'var(--texte-attenue)' }}>{f.notes}</p>
          </div>
        ) : null}
      </div>
    </Modale>
  )
}
