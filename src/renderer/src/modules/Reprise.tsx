/**
 * Reprise de données depuis l'ancien logiciel.
 *
 * Trois temps, dans cet ordre, parce que c'est l'ordre dans lequel on gagne la
 * confiance de quelqu'un qui s'apprête à verser trois mille références dans un
 * logiciel qu'il ne connaît pas encore :
 *
 *   1. on ouvre son fichier et on lui montre ce qu'on y a lu ;
 *   2. on lui montre quelle colonne on a comprise comme quoi, et il corrige ;
 *   3. on simule — on compte tout, on n'écrit rien — et il décide.
 *
 * L'import n'est proposé qu'après une simulation. C'est volontaire : personne
 * ne doit pouvoir verser un fichier dans son catalogue sans avoir vu d'abord
 * ce que cela produira.
 */
import { useState } from 'react'
import { useAction } from '../lib/hooks'
import { useNotifications } from '../ui/Notifications'
import {
  Bandeau,
  Bouton,
  Case,
  Etiquette,
  Indicateur,
  Liste,
  Panneau,
  Segments
} from '../ui/Composants'
import { nombre } from '../lib/format'

type TypeReprise = 'produits' | 'clients' | 'fournisseurs'

interface ChampReprise {
  cle: string
  libelle: string
  obligatoire: boolean
  aide?: string
}

interface Analyse {
  chemin: string
  colonnes: string[]
  apercu: string[][]
  lignes: number
  separateur: string
  suggestion: Record<string, number>
}

interface Anomalie {
  ligne: number
  motif: string
  valeur?: string
}

interface Rapport {
  lignesLues: number
  crees: number
  misAJour: number
  ignores: number
  refuses: number
  anomalies: Anomalie[]
  lotsCrees: number
  creancesReprises: number
  simulation: boolean
}

const NATURES: { valeur: TypeReprise; libelle: string; description: string }[] = [
  {
    valeur: 'produits',
    libelle: 'Catalogue',
    description: 'Produits, prix, stock d’ouverture et péremptions.'
  },
  { valeur: 'clients', libelle: 'Clients', description: 'Clients et créances en cours.' },
  { valeur: 'fournisseurs', libelle: 'Fournisseurs', description: 'Fournisseurs et coordonnées.' }
]

export default function Reprise() {
  const action = useAction()
  const notifications = useNotifications()

  const [type, setType] = useState<TypeReprise>('produits')
  const [champs, setChamps] = useState<ChampReprise[]>([])
  const [analyse, setAnalyse] = useState<Analyse | null>(null)
  const [correspondance, setCorrespondance] = useState<Record<string, number>>({})
  const [mettreAJour, setMettreAJour] = useState(false)
  const [rapport, setRapport] = useState<Rapport | null>(null)

  function changerNature(nouveau: TypeReprise): void {
    setType(nouveau)
    // Une correspondance établie pour un catalogue n'a aucun sens pour des
    // clients : on repart du fichier plutôt que de traîner des associations
    // fausses.
    setAnalyse(null)
    setCorrespondance({})
    setRapport(null)
  }

  async function ouvrirFichier(): Promise<void> {
    const listeChamps = await action.executer<ChampReprise[]>('reprise.champs', { type })
    const resultat = await action.executer<Analyse | null>('reprise.choisirFichier', { type })
    if (!resultat) return

    setChamps(listeChamps ?? [])
    setAnalyse(resultat)
    setCorrespondance(resultat.suggestion)
    setRapport(null)
  }

  const manquants = champs.filter(
    (c) => c.obligatoire && correspondance[c.cle] === undefined
  )

  async function simuler(): Promise<void> {
    if (!analyse) return
    const r = await action.executer<Rapport>('reprise.simuler', {
      chemin: analyse.chemin,
      type,
      correspondance,
      mettreAJour
    })
    if (r) setRapport(r)
  }

  async function importer(): Promise<void> {
    if (!analyse) return
    const r = await action.executer<Rapport>('reprise.importer', {
      chemin: analyse.chemin,
      type,
      correspondance,
      mettreAJour
    })
    if (!r) return
    setRapport(r)
    notifications.succes(
      'Reprise terminée',
      `${r.crees} créé(s), ${r.misAJour} mis à jour, ${r.refuses} refusé(s).`
    )
  }

  return (
    <div className="pile">
      {action.erreur ? <Bandeau ton="danger">{action.erreur.message}</Bandeau> : null}

      <Panneau
        titre="Que reprenez-vous ?"
        description="Exportez depuis votre ancien logiciel en CSV, puis ouvrez le fichier ici."
      >
        <div className="pile">
          <Segments
            valeur={type}
            options={NATURES.map((n) => ({ valeur: n.valeur, libelle: n.libelle }))}
            onChange={(v) => changerNature(v as TypeReprise)}
          />
          <p style={{ color: 'var(--texte-attenue)', fontSize: 12.5 }}>
            {NATURES.find((n) => n.valeur === type)?.description}
          </p>
          <div className="rangee">
            <Bouton icone="telecharger" enCours={action.enCours} onClick={ouvrirFichier}>
              {analyse ? 'Choisir un autre fichier' : 'Ouvrir un fichier'}
            </Bouton>
          </div>
        </div>
      </Panneau>

      {!analyse ? (
        <Panneau titre="Comment cela se passe">
          <ol className="marche-a-suivre">
            <li>
              <strong>Exportez depuis votre ancien logiciel.</strong> Presque tous savent produire
              un fichier CSV ou Excel enregistré en CSV. Peu importe le nom des colonnes ni leur
              ordre.
            </li>
            <li>
              <strong>Vérifiez la correspondance.</strong> Nous devinons quelle colonne est le nom,
              le prix, le stock. Vous corrigez ce qui ne va pas — rien n’est repris sans votre
              accord.
            </li>
            <li>
              <strong>Simulez.</strong> Le logiciel lit tout, contrôle tout, compte tout, et
              n’écrit rien. Vous voyez combien de fiches seront créées et quelles lignes de votre
              fichier posent problème, avec leur numéro.
            </li>
            <li>
              <strong>Reprenez.</strong> L’enregistrement passe entièrement ou ne laisse rien : un
              catalogue à moitié repris serait pire que pas de reprise.
            </li>
          </ol>
          <p style={{ marginTop: 12, fontSize: 12, color: 'var(--texte-faible)' }}>
            Les quantités reprises créent un lot d’ouverture, tracé comme toute autre entrée de
            stock. Les créances reprises apparaissent au relevé de chaque client : le solde reste
            une somme d’opérations, jamais un chiffre posé à la main.
          </p>
        </Panneau>
      ) : null}

      {analyse ? (
        <>
          <Panneau
            titre="Ce que nous avons lu"
            description={`${nombre(analyse.lignes)} ligne(s), ${analyse.colonnes.length} colonne(s), séparées par « ${analyse.separateur === '\t' ? 'tabulation' : analyse.separateur} ».`}
          >
            <div className="tableau-defilement">
              <table className="tableau">
                <thead>
                  <tr>
                    {analyse.colonnes.map((colonne, i) => (
                      <th key={i}>{colonne || `Colonne ${i + 1}`}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analyse.apercu.map((ligne, i) => (
                    <tr key={i}>
                      {analyse.colonnes.map((_, j) => (
                        <td key={j}>{ligne[j] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panneau>

          <Panneau
            titre="Correspondance des colonnes"
            description="Vérifiez ce que nous avons deviné. Rien n’est repris sans votre accord."
            pied={
              <div className="rangee espace">
                <Case
                  libelle="Mettre à jour ce qui existe déjà"
                  description="Sinon, les fiches déjà présentes sont simplement ignorées."
                  checked={mettreAJour}
                  onChange={(e) => setMettreAJour(e.target.checked)}
                />
                <Bouton
                  variante="principal"
                  enCours={action.enCours}
                  disabled={manquants.length > 0}
                  onClick={simuler}
                >
                  Simuler la reprise
                </Bouton>
              </div>
            }
          >
            {manquants.length ? (
              <div style={{ marginBottom: 12 }}>
                <Bandeau ton="attention">
                  À associer avant de continuer : {manquants.map((c) => c.libelle).join(', ')}.
                </Bandeau>
              </div>
            ) : null}

            <div className="grille deux">
              {champs.map((champ) => (
                <Liste
                  key={champ.cle}
                  libelle={champ.libelle + (champ.obligatoire ? ' *' : '')}
                  aide={champ.aide}
                  vide="— Non repris —"
                  options={analyse.colonnes.map((colonne, i) => ({
                    valeur: i,
                    libelle: colonne || `Colonne ${i + 1}`
                  }))}
                  value={correspondance[champ.cle] ?? ''}
                  onChange={(e) => {
                    const suivant = { ...correspondance }
                    if (e.target.value === '') delete suivant[champ.cle]
                    else suivant[champ.cle] = Number(e.target.value)
                    setCorrespondance(suivant)
                    setRapport(null)
                  }}
                />
              ))}
            </div>
          </Panneau>
        </>
      ) : null}

      {rapport ? <RapportReprise rapport={rapport} onImporter={importer} enCours={action.enCours} /> : null}
    </div>
  )
}

function RapportReprise({
  rapport,
  onImporter,
  enCours
}: {
  rapport: Rapport
  onImporter: () => void
  enCours: boolean
}) {
  const propre = rapport.refuses === 0

  return (
    <Panneau
      titre={rapport.simulation ? 'Résultat de la simulation' : 'Reprise effectuée'}
      description={
        rapport.simulation
          ? 'Rien n’a encore été écrit dans votre base.'
          : 'Les données sont enregistrées.'
      }
      pied={
        rapport.simulation ? (
          <div className="rangee espace">
            <span style={{ fontSize: 12, color: 'var(--texte-attenue)' }}>
              {propre
                ? 'Aucune anomalie. Vous pouvez reprendre ces données.'
                : 'Vous pouvez reprendre malgré tout : les lignes fautives seront ignorées, les autres passeront.'}
            </span>
            <Bouton variante="principal" enCours={enCours} onClick={onImporter}>
              Reprendre ces données
            </Bouton>
          </div>
        ) : undefined
      }
    >
      <div className="indicateurs">
        <Indicateur libelle="Lignes lues" valeur={nombre(rapport.lignesLues)} />
        <Indicateur libelle="À créer" valeur={nombre(rapport.crees)} />
        <Indicateur libelle="À mettre à jour" valeur={nombre(rapport.misAJour)} />
        <Indicateur libelle="Ignorées" valeur={nombre(rapport.ignores)} />
        <Indicateur
          libelle="Refusées"
          valeur={nombre(rapport.refuses)}
          ton={rapport.refuses > 0 ? 'danger' : undefined}
        />
      </div>

      {rapport.lotsCrees > 0 || rapport.creancesReprises > 0 ? (
        <p style={{ marginTop: 12, fontSize: 12.5, color: 'var(--texte-attenue)' }}>
          {rapport.lotsCrees > 0 ? `${nombre(rapport.lotsCrees)} lot(s) d’ouverture. ` : ''}
          {rapport.creancesReprises > 0
            ? `${nombre(rapport.creancesReprises)} créance(s) reprise(s), inscrites au relevé de chaque client.`
            : ''}
        </p>
      ) : null}

      {rapport.anomalies.length ? (
        <div style={{ marginTop: 14 }}>
          <div className="formulaire-titre">Lignes à corriger dans votre fichier</div>
          <div className="tableau-defilement" style={{ maxHeight: 260 }}>
            <table className="tableau">
              <thead>
                <tr>
                  <th style={{ width: 80 }}>Ligne</th>
                  <th>Motif</th>
                  <th>Valeur lue</th>
                </tr>
              </thead>
              <tbody>
                {rapport.anomalies.map((a, i) => (
                  <tr key={i}>
                    <td>
                      <Etiquette ton="danger" sansPoint>
                        {a.ligne}
                      </Etiquette>
                    </td>
                    <td>{a.motif}</td>
                    <td style={{ color: 'var(--texte-attenue)' }}>{a.valeur ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 8, fontSize: 11.5, color: 'var(--texte-faible)' }}>
            Les numéros correspondent aux lignes de votre tableur, en-tête comprise.
          </p>
        </div>
      ) : null}
    </Panneau>
  )
}
