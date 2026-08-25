import { useState } from 'react'
import type { Inventaire as SessionInventaire, InventaireLigne } from '@shared/types'
import { useAction, useRequete } from '../lib/hooks'
import { useSession } from '../app/Session'
import { useFonctions } from '../app/fonctions'
import { useNotifications } from '../ui/Notifications'
import {
  Bandeau,
  Bouton,
  Champ,
  Chargement,
  Confirmation,
  EntetePage,
  Etiquette,
  EtatVide,
  Indicateur,
  Liste,
  Modale,
  Panneau,
  ZoneTexte
} from '../ui/Composants'
import Tableau, { CellulePrincipale, RechercheTableau } from '../ui/Tableau'
import { dateCourte, montant, nombre } from '../lib/format'

export default function Inventaire() {
  const session = useSession()
  const notifications = useNotifications()
  const [ouverture, setOuverture] = useState(false)
  const [consultation, setConsultation] = useState<number | null>(null)

  const enCours = useRequete<SessionInventaire | null>('inventaire.enCours')
  const historique = useRequete<SessionInventaire[]>('inventaire.lister')

  useFonctions('inventaire', [
    {
      touche: 'F2',
      libelle: 'Ouvrir un inventaire',
      action: () => setOuverture(true),
      disponible: session.peut('inventaire.creer') && !enCours.donnees,
      saillante: true
    },
    {
      touche: 'F5',
      libelle: 'Actualiser',
      action: () => {
        enCours.recharger()
        historique.recharger()
      }
    }
  ])

  function rafraichir(): void {
    enCours.recharger()
    historique.recharger()
  }

  return (
    <>
      <EntetePage
        titre="Inventaire"
        actions={
          session.peut('inventaire.creer') && !enCours.donnees ? (
            <Bouton variante="principal" icone="plus" onClick={() => setOuverture(true)}>
              Ouvrir un inventaire
            </Bouton>
          ) : null
        }
      />

      {enCours.chargement ? (
        <Chargement />
      ) : enCours.donnees ? (
        <Comptage
          inventaire={enCours.donnees}
          onChange={rafraichir}
          onValide={(resultat) => {
            rafraichir()
            notifications.succes(
              'Inventaire validé',
              `${resultat.lignesAjustees} écart(s) ajusté(s), valeur ${montant(resultat.ecartValeur)}.`
            )
          }}
        />
      ) : (
        <div style={{ marginBottom: 14 }}>
          <Panneau>
            <EtatVide
              icone="inventaire"
              titre="Aucun inventaire en cours"
              action={
                session.peut('inventaire.creer') ? (
                  <Bouton variante="principal" icone="plus" onClick={() => setOuverture(true)}>
                    Ouvrir un inventaire
                  </Bouton>
                ) : undefined
              }
            >
              À l’ouverture, le stock théorique est figé lot par lot. Vous pouvez ensuite compter à
              votre rythme : les ventes de la journée ne fausseront pas la comparaison.
            </EtatVide>
          </Panneau>
        </div>
      )}

      <Tableau
        colonnes={[
          {
            cle: 'reference',
            entete: 'Inventaire',
            rendu: (i: SessionInventaire) => <CellulePrincipale titre={i.reference} sous={i.libelle} />,
            triSur: (i: SessionInventaire) => i.ouvert_at
          },
          {
            cle: 'ouvert',
            entete: 'Ouvert le',
            rendu: (i: SessionInventaire) => dateCourte(i.ouvert_at),
            triSur: (i: SessionInventaire) => i.ouvert_at
          },
          { cle: 'par', entete: 'Par', rendu: (i: SessionInventaire) => i.ouvert_par_nom ?? '—' },
          {
            cle: 'lignes',
            entete: 'Lots comptés',
            nombre: true,
            rendu: (i: SessionInventaire) => `${nombre(i.nb_comptees ?? 0)} / ${nombre(i.nb_lignes ?? 0)}`
          },
          {
            cle: 'ecart',
            entete: 'Écart valorisé',
            nombre: true,
            rendu: (i: SessionInventaire) =>
              i.statut !== 'valide' ? (
                '—'
              ) : i.ecart_valeur === 0 ? (
                <Etiquette ton="succes">Aucun écart</Etiquette>
              ) : (
                <strong style={{ color: i.ecart_valeur < 0 ? 'var(--danger)' : 'var(--succes)' }}>
                  {i.ecart_valeur > 0 ? '+' : ''}
                  {montant(i.ecart_valeur)}
                </strong>
              ),
            triSur: (i: SessionInventaire) => i.ecart_valeur
          },
          {
            cle: 'statut',
            entete: 'Statut',
            largeur: '120px',
            rendu: (i: SessionInventaire) =>
              i.statut === 'valide' ? (
                <Etiquette ton="succes">Validé</Etiquette>
              ) : i.statut === 'annule' ? (
                <Etiquette ton="neutre">Annulé</Etiquette>
              ) : (
                <Etiquette ton="info">En cours</Etiquette>
              )
          }
        ]}
        lignes={historique.donnees}
        cle={(i) => i.id}
        chargement={historique.chargement}
        erreur={historique.erreur}
        onReessayer={historique.recharger}
        onLigneClic={(i) => (i.statut === 'valide' ? setConsultation(i.id) : undefined)}
        parPage={20}
        resume={(n) => `${n} inventaire${n > 1 ? 's' : ''}`}
        vide={
          <EtatVide icone="inventaire" titre="Aucun inventaire réalisé">
            L’historique conservera chaque session, son écart valorisé et les justifications saisies.
          </EtatVide>
        }
      />

      {ouverture ? (
        <Ouverture
          onFermer={() => setOuverture(false)}
          onOuvert={() => {
            setOuverture(false)
            rafraichir()
            notifications.succes('Inventaire ouvert')
          }}
        />
      ) : null}

      {consultation !== null ? (
        <ConsultationInventaire id={consultation} onFermer={() => setConsultation(null)} />
      ) : null}
    </>
  )
}

function Ouverture({ onFermer, onOuvert }: { onFermer: () => void; onOuvert: () => void }) {
  const action = useAction()
  const [libelle, setLibelle] = useState('')
  const [perimetre, setPerimetre] = useState<'total' | 'categorie' | 'emplacement'>('total')
  const [reference, setReference] = useState('')

  const referentiels = useRequete<{ categories: { id: number; nom: string }[] }>('produits.referentiels')

  async function ouvrir(): Promise<void> {
    const r = await action.executer('inventaire.ouvrir', {
      libelle: libelle.trim(),
      perimetre,
      perimetreRef: perimetre === 'total' ? null : reference || null
    })
    if (r !== null) onOuvert()
  }

  return (
    <Modale
      titre="Ouvrir un inventaire"
      description="Le stock théorique sera figé à cet instant, lot par lot."
      onFermer={onFermer}
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton
            variante="principal"
            disabled={libelle.trim().length < 3 || (perimetre !== 'total' && !reference)}
            enCours={action.enCours}
            onClick={ouvrir}
          >
            Ouvrir l’inventaire
          </Bouton>
        </>
      }
    >
      <div className="panneau-corps pile">
        {action.erreur ? <Bandeau ton="danger">{action.erreur.message}</Bandeau> : null}
        <Champ
          libelle="Nom de l’inventaire"
          obligatoire
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          placeholder="Inventaire général — août 2026"
          autoFocus
        />
        <Liste
          libelle="Périmètre"
          options={[
            { valeur: 'total', libelle: 'Tout le stock' },
            { valeur: 'categorie', libelle: 'Une catégorie' },
            { valeur: 'emplacement', libelle: 'Un emplacement' }
          ]}
          value={perimetre}
          onChange={(e) => setPerimetre(e.target.value as typeof perimetre)}
          aide="Un inventaire partiel est plus rapide à compter et tout aussi fiable."
        />
        {perimetre === 'categorie' ? (
          <Liste
            libelle="Catégorie"
            obligatoire
            vide="Choisir…"
            options={(referentiels.donnees?.categories ?? []).map((c) => ({ valeur: c.id, libelle: c.nom }))}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        ) : null}
        {perimetre === 'emplacement' ? (
          <Champ
            libelle="Emplacement"
            obligatoire
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Rayon A-12"
            aide="Saisissez l’emplacement exactement tel qu’il figure sur les fiches produits."
          />
        ) : null}
      </div>
    </Modale>
  )
}

function Comptage({
  inventaire,
  onChange,
  onValide
}: {
  inventaire: SessionInventaire
  onChange: () => void
  onValide: (resultat: { lignesAjustees: number; ecartValeur: number; ecartUnites: number }) => void
}) {
  const session = useSession()
  const action = useAction()
  const [recherche, setRecherche] = useState('')
  const [validation, setValidation] = useState(false)
  const [annulation, setAnnulation] = useState(false)
  const [motifAnnulation, setMotifAnnulation] = useState('')
  const [saisies, setSaisies] = useState<Record<number, string>>({})

  const detail = useRequete<SessionInventaire & { lignes: InventaireLigne[] }>('inventaire.detail', {
    id: inventaire.id
  })

  const lignes = (detail.donnees?.lignes ?? []).filter(
    (l) => !recherche.trim() || l.nom_commercial.toLowerCase().includes(recherche.trim().toLowerCase())
  )

  const comptees = (detail.donnees?.lignes ?? []).filter((l) => l.stock_compte !== null)
  const ecarts = comptees.filter((l) => (l.ecart ?? 0) !== 0)
  const ecartValeur = ecarts.reduce((s, l) => s + (l.ecart ?? 0) * l.prix_achat, 0)

  async function enregistrerComptage(ligne: InventaireLigne, valeur: string): Promise<void> {
    const quantite = Number(valeur)
    if (!Number.isFinite(quantite) || quantite < 0) return
    await action.executer('inventaire.compter', {
      ligneId: ligne.id,
      quantite,
      justification: null
    })
    detail.recharger()
  }

  async function valider(): Promise<void> {
    const r = await action.executer<{ lignesAjustees: number; ecartValeur: number; ecartUnites: number }>(
      'inventaire.valider',
      { id: inventaire.id }
    )
    if (r) {
      setValidation(false)
      onValide(r)
    }
  }

  async function annuler(): Promise<void> {
    const r = await action.executer('inventaire.annuler', {
      id: inventaire.id,
      motif: motifAnnulation.trim()
    })
    if (r !== null) {
      setAnnulation(false)
      onChange()
    }
  }

  return (
    <>
      <div className="indicateurs">
        <Indicateur
          libelle="Lots à compter"
          valeur={nombre(detail.donnees?.nb_lignes ?? 0)}
        />
        <Indicateur
          libelle="Lots comptés"
          valeur={`${nombre(comptees.length)}`}
        />
        <Indicateur
          libelle="Écarts constatés"
          valeur={nombre(ecarts.length)}
          ton={ecarts.length > 0 ? 'danger' : undefined}
        />
        <Indicateur
          libelle="Écart valorisé"
          valeur={montant(ecartValeur)}
          ton={ecartValeur < 0 ? 'danger' : undefined}
        />
      </div>

      <Tableau
        colonnes={[
          {
            cle: 'produit',
            entete: 'Produit',
            rendu: (l: InventaireLigne) => (
              <CellulePrincipale
                titre={`${l.nom_commercial} ${l.dosage ?? ''}`}
                sous={[l.numero_lot ? `Lot ${l.numero_lot}` : 'Sans numéro', l.emplacement]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ),
            triSur: (l: InventaireLigne) => l.nom_commercial
          },
          {
            cle: 'peremption',
            entete: 'Péremption',
            largeur: '120px',
            rendu: (l: InventaireLigne) => dateCourte(l.date_peremption)
          },
          {
            cle: 'theorique',
            entete: 'Théorique',
            nombre: true,
            rendu: (l: InventaireLigne) => nombre(l.stock_theorique),
            triSur: (l: InventaireLigne) => l.stock_theorique
          },
          {
            cle: 'compte',
            entete: 'Compté',
            largeur: '110px',
            rendu: (l: InventaireLigne) => (
              <input
                type="number"
                min={0}
                value={saisies[l.id] ?? (l.stock_compte !== null ? String(l.stock_compte) : '')}
                onChange={(e) => setSaisies((s) => ({ ...s, [l.id]: e.target.value }))}
                onBlur={(e) => {
                  if (e.target.value !== '') enregistrerComptage(l, e.target.value)
                }}
                placeholder="—"
                aria-label={`Quantité comptée pour ${l.nom_commercial}`}
                style={{
                  width: '100%',
                  height: 28,
                  padding: '0 6px',
                  textAlign: 'right',
                  border: '1px solid var(--bordure-nette)',
                  borderRadius: 4
                }}
              />
            )
          },
          {
            cle: 'ecart',
            entete: 'Écart',
            nombre: true,
            rendu: (l: InventaireLigne) =>
              l.stock_compte === null ? (
                <span style={{ color: 'var(--texte-faible)' }}>Non compté</span>
              ) : l.ecart === 0 ? (
                <Etiquette ton="succes">Conforme</Etiquette>
              ) : (
                <strong style={{ color: (l.ecart ?? 0) < 0 ? 'var(--danger)' : 'var(--succes)' }}>
                  {(l.ecart ?? 0) > 0 ? '+' : ''}
                  {nombre(l.ecart)}
                </strong>
              ),
            triSur: (l: InventaireLigne) => l.ecart ?? 0
          },
          {
            cle: 'valeur',
            entete: 'Impact',
            nombre: true,
            rendu: (l: InventaireLigne) =>
              l.ecart ? montant((l.ecart ?? 0) * l.prix_achat) : <span style={{ color: 'var(--texte-faible)' }}>—</span>
          }
        ]}
        lignes={lignes}
        cle={(l) => l.id}
        chargement={detail.chargement}
        erreur={detail.erreur}
        onReessayer={detail.recharger}
        parPage={40}
        filtreActif={recherche.trim().length > 0}
        resume={(n) => `${n} lot${n > 1 ? 's' : ''} affiché${n > 1 ? 's' : ''}`}
        outils={
          <>
            <RechercheTableau valeur={recherche} onChange={setRecherche} placeholder="Rechercher un produit…" />
            <div style={{ marginLeft: 'auto' }} className="rangee">
              {session.peut('inventaire.creer') ? (
                <Bouton variante="discret" onClick={() => setAnnulation(true)}>
                  Annuler l’inventaire
                </Bouton>
              ) : null}
              {session.peut('inventaire.valider') ? (
                <Bouton
                  variante="principal"
                  icone="coche"
                  disabled={comptees.length === 0}
                  onClick={() => setValidation(true)}
                >
                  Valider l’inventaire
                </Bouton>
              ) : null}
            </div>
          </>
        }
        vide={<EtatVide icone="inventaire" titre="Aucun lot dans ce périmètre" />}
        videApresFiltre={<EtatVide icone="recherche" titre="Aucun produit ne correspond" />}
      />

      {validation ? (
        <Confirmation
          titre="Valider l’inventaire"
          message={`${ecarts.length} écart(s) seront ajustés dans le stock, pour une valeur de ${montant(ecartValeur)}. Chaque ajustement laissera un mouvement tracé.`}
          detail={
            <>
              {comptees.length < (detail.donnees?.nb_lignes ?? 0) ? (
                <Bandeau ton="attention" titre="Comptage incomplet">
                  {(detail.donnees?.nb_lignes ?? 0) - comptees.length} lot(s) n’ont pas été comptés.
                  Ils seront ignorés : leur stock restera inchangé.
                </Bandeau>
              ) : null}
              {action.erreur ? <Bandeau ton="danger">{action.erreur.message}</Bandeau> : null}
            </>
          }
          libelleAction="Valider et ajuster"
          enCours={action.enCours}
          onConfirmer={valider}
          onAnnuler={() => setValidation(false)}
        />
      ) : null}

      {annulation ? (
        <Modale
          titre="Annuler l’inventaire"
          onFermer={() => setAnnulation(false)}
          pied={
            <>
              <Bouton onClick={() => setAnnulation(false)}>Revenir</Bouton>
              <Bouton
                variante="danger"
                disabled={motifAnnulation.trim().length < 3}
                enCours={action.enCours}
                onClick={annuler}
              >
                Annuler l’inventaire
              </Bouton>
            </>
          }
        >
          <div className="panneau-corps pile">
            <Bandeau ton="attention">
              Aucun ajustement ne sera appliqué. Les comptages saisis seront conservés dans
              l’historique mais n’auront aucun effet sur le stock.
            </Bandeau>
            {action.erreur ? <Bandeau ton="danger">{action.erreur.message}</Bandeau> : null}
            <ZoneTexte
              libelle="Motif"
              obligatoire
              value={motifAnnulation}
              onChange={(e) => setMotifAnnulation(e.target.value)}
            />
          </div>
        </Modale>
      ) : null}
    </>
  )
}

function ConsultationInventaire({ id, onFermer }: { id: number; onFermer: () => void }) {
  const detail = useRequete<SessionInventaire & { lignes: InventaireLigne[] }>('inventaire.detail', { id })

  if (!detail.donnees) {
    return (
      <Modale titre="Inventaire" onFermer={onFermer}>
        <div className="panneau-corps">
          {detail.erreur ? <Bandeau ton="danger">{detail.erreur.message}</Bandeau> : <Chargement />}
        </div>
      </Modale>
    )
  }

  const i = detail.donnees
  const ecarts = i.lignes.filter((l) => (l.ecart ?? 0) !== 0)

  return (
    <Modale
      titre={`${i.reference} — ${i.libelle}`}
      description={`Validé le ${dateCourte(i.valide_at)} · écart de ${montant(i.ecart_valeur)}`}
      large
      onFermer={onFermer}
      pied={
        <Bouton variante="principal" onClick={onFermer}>
          Fermer
        </Bouton>
      }
    >
      {ecarts.length === 0 ? (
        <EtatVide icone="coche" titre="Aucun écart constaté">
          Le comptage physique correspondait exactement au stock théorique.
        </EtatVide>
      ) : (
        <div className="tableau-defilement" style={{ maxHeight: 420, overflowY: 'auto' }}>
          <table className="tableau">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Lot</th>
                <th className="cellule-nombre">Théorique</th>
                <th className="cellule-nombre">Compté</th>
                <th className="cellule-nombre">Écart</th>
                <th>Justification</th>
              </tr>
            </thead>
            <tbody>
              {ecarts.map((l) => (
                <tr key={l.id}>
                  <td>{l.nom_commercial}</td>
                  <td style={{ color: 'var(--texte-faible)' }}>{l.numero_lot ?? '—'}</td>
                  <td className="cellule-nombre">{nombre(l.stock_theorique)}</td>
                  <td className="cellule-nombre">{nombre(l.stock_compte)}</td>
                  <td className="cellule-nombre">
                    <strong style={{ color: (l.ecart ?? 0) < 0 ? 'var(--danger)' : 'var(--succes)' }}>
                      {(l.ecart ?? 0) > 0 ? '+' : ''}
                      {nombre(l.ecart)}
                    </strong>
                  </td>
                  <td style={{ color: 'var(--texte-attenue)' }}>{l.justification ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modale>
  )
}
