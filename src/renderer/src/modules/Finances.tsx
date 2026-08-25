import { useCallback, useState } from 'react'
import type { Depense } from '@shared/types'
import { useAction, useRequete } from '../lib/hooks'
import { useSession } from '../app/Session'
import { useFonctions } from '../app/fonctions'
import { enregistrerCSV } from '../lib/export'
import { useNotifications } from '../ui/Notifications'
import { signalerCaisseModifiee } from '../lib/evenements'
import {
  Bandeau,
  Bouton,
  Champ,
  ChampMontant,
  EntetePage,
  Etiquette,
  EtatVide,
  Indicateur,
  Liste,
  Modale,
  Panneau,
  Segments,
  ZoneTexte
} from '../ui/Composants'
import Tableau, { CellulePrincipale } from '../ui/Tableau'
import { aujourdhui, dateCourte, debutDuMois, decalerJours, modePaiement, montant } from '../lib/format'

interface Synthese {
  periode: { depuis: string; jusqua: string }
  chiffreAffaires: number
  coutMarchandises: number
  margeBrute: number
  depenses: number
  achats: number
  resultat: number
  nbVentes: number
  panierMoyen: number
  dettesFournisseurs: number
  creancesClients: number
  valeurStock: number
  parCategorieDepense: { categorie: string; montant: number }[]
  parModePaiement: { mode: string; montant: number; nb: number }[]
}

type Periode = 'jour' | 'semaine' | 'mois' | 'personnalise'

export default function Finances() {
  const session = useSession()
  const notifications = useNotifications()
  const [periode, setPeriode] = useState<Periode>('mois')
  const [depuis, setDepuis] = useState(debutDuMois())
  const [jusqua, setJusqua] = useState(aujourdhui())
  const [saisieDepense, setSaisieDepense] = useState(false)

  function changerPeriode(p: Periode): void {
    setPeriode(p)
    const fin = aujourdhui()
    setJusqua(fin)
    if (p === 'jour') setDepuis(fin)
    else if (p === 'semaine') setDepuis(decalerJours(fin, -6))
    else if (p === 'mois') setDepuis(debutDuMois(fin))
  }

  const synthese = useRequete<Synthese>('finances.synthese', { depuis, jusqua }, session.peut('finances.voir'))
  const depenses = useRequete<Depense[]>('depenses.lister', { depuis, jusqua }, session.peut('depenses.voir'))

  const s = synthese.donnees

  const exporterDepenses = useCallback(async () => {
    const lignes = (depenses.donnees ?? []).map((d) => [
      d.reference,
      d.date,
      d.categorie ?? '',
      d.libelle,
      d.beneficiaire ?? '',
      modePaiement(d.mode),
      montant(d.montant, false),
      d.utilisateur ?? ''
    ])
    const fichier = await enregistrerCSV(
      `depenses-${depuis}-${jusqua}`,
      ['Reference', 'Date', 'Categorie', 'Libelle', 'Beneficiaire', 'Mode', 'Montant', 'Enregistre par'],
      lignes
    )
    if (fichier) notifications.succes('Export terminé', fichier)
  }, [depenses.donnees, depuis, jusqua, notifications])

  useFonctions('finances', [
    {
      touche: 'F2',
      libelle: 'Enregistrer une dépense',
      action: () => setSaisieDepense(true),
      disponible: session.peut('depenses.creer'),
      saillante: true
    },
    {
      touche: 'F5',
      libelle: 'Actualiser',
      action: () => {
        synthese.recharger()
        depenses.recharger()
      }
    },
    {
      touche: 'F8',
      libelle: 'Exporter les dépenses',
      action: exporterDepenses,
      disponible: session.peut('rapports.exporter') && (depenses.donnees?.length ?? 0) > 0
    }
  ])

  return (
    <>
      <EntetePage
        titre="Finances"
        actions={
          <>
            <Segments
              valeur={periode}
              options={[
                { valeur: 'jour', libelle: "Aujourd'hui" },
                { valeur: 'semaine', libelle: '7 jours' },
                { valeur: 'mois', libelle: 'Ce mois' },
                { valeur: 'personnalise', libelle: 'Période' }
              ]}
              onChange={changerPeriode}
            />
            {session.peut('rapports.exporter') ? (
              <Bouton
                icone="telecharger"
                disabled={(depenses.donnees?.length ?? 0) === 0}
                onClick={exporterDepenses}
              >
                Exporter
              </Bouton>
            ) : null}
            {session.peut('depenses.creer') ? (
              <Bouton variante="principal" icone="plus" onClick={() => setSaisieDepense(true)}>
                Enregistrer une dépense
              </Bouton>
            ) : null}
          </>
        }
      />

      {periode === 'personnalise' ? (
        <div style={{ marginBottom: 14 }}>
          <Panneau>
            <div className="grille deux" style={{ maxWidth: 460 }}>
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
            </div>
          </Panneau>
        </div>
      ) : null}

      {session.peut('finances.voir') ? (
        <>
          <div className="indicateurs">
            <Indicateur
              libelle="Chiffre d’affaires"
              valeur={montant(s?.chiffreAffaires ?? 0)}
            />
            <Indicateur
              libelle="Marge brute"
              valeur={montant(s?.margeBrute ?? 0)}
            />
            <Indicateur
              libelle="Dépenses"
              valeur={montant(s?.depenses ?? 0)}
            />
            <Indicateur
              libelle="Résultat"
              valeur={montant(s?.resultat ?? 0)}
              ton={(s?.resultat ?? 0) < 0 ? 'danger' : undefined}
            />
            <Indicateur
              libelle="Panier moyen"
              valeur={montant(s?.panierMoyen ?? 0)}
            />
          </div>

          <div className="deux-colonnes" style={{ marginBottom: 14 }}>
            <Panneau titre="Engagements" description="Ce que vous devez et ce qu’on vous doit.">
              <dl className="liste-definitions">
                <dt>Valeur du stock</dt>
                <dd>{montant(s?.valeurStock ?? 0)}</dd>
                <dt>Dettes fournisseurs</dt>
                <dd style={{ color: (s?.dettesFournisseurs ?? 0) > 0 ? 'var(--attention)' : undefined }}>
                  {montant(s?.dettesFournisseurs ?? 0)}
                </dd>
                <dt>Créances clients</dt>
                <dd style={{ color: (s?.creancesClients ?? 0) > 0 ? 'var(--attention)' : undefined }}>
                  {montant(s?.creancesClients ?? 0)}
                </dd>
                <dt>Achats de la période</dt>
                <dd>{montant(s?.achats ?? 0)}</dd>
              </dl>
            </Panneau>

            <Panneau titre="Règlements par mode" description="Le crédit correspond aux ventes non encore réglées.">
              {!s?.parModePaiement.length ? (
                <p style={{ fontSize: 12.5, color: 'var(--texte-faible)' }}>
                  Aucun règlement sur la période.
                </p>
              ) : (
                <div className="pile" style={{ gap: 9 }}>
                  {s.parModePaiement.map((m) => {
                    const part = s.chiffreAffaires ? (m.montant / s.chiffreAffaires) * 100 : 0
                    return (
                      <div key={m.mode}>
                        <div className="rangee espace" style={{ marginBottom: 3 }}>
                          <span style={{ fontSize: 12.5 }}>{modePaiement(m.mode)}</span>
                          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{montant(m.montant)}</span>
                        </div>
                        <div className="jauge">
                          <div className="jauge-remplissage" style={{ width: `${part}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Panneau>
          </div>
        </>
      ) : null}

      {session.peut('depenses.voir') ? (
        <Tableau
          colonnes={[
            {
              cle: 'reference',
              entete: 'Dépense',
              rendu: (d: Depense) => <CellulePrincipale titre={d.libelle} sous={d.reference} />,
              triSur: (d: Depense) => d.libelle
            },
            {
              cle: 'categorie',
              entete: 'Catégorie',
              largeur: '160px',
              rendu: (d: Depense) => <Etiquette ton="neutre">{d.categorie ?? '—'}</Etiquette>,
              triSur: (d: Depense) => d.categorie ?? ''
            },
            {
              cle: 'date',
              entete: 'Date',
              largeur: '110px',
              rendu: (d: Depense) => dateCourte(d.date),
              triSur: (d: Depense) => d.date
            },
            {
              cle: 'beneficiaire',
              entete: 'Bénéficiaire',
              rendu: (d: Depense) => d.beneficiaire ?? '—'
            },
            { cle: 'mode', entete: 'Mode', largeur: '130px', rendu: (d: Depense) => modePaiement(d.mode) },
            {
              cle: 'montant',
              entete: 'Montant',
              nombre: true,
              rendu: (d: Depense) => <strong style={{ color: 'var(--danger)' }}>{montant(d.montant)}</strong>,
              triSur: (d: Depense) => d.montant
            },
            { cle: 'utilisateur', entete: 'Par', largeur: '140px', rendu: (d: Depense) => d.utilisateur ?? '—' }
          ]}
          lignes={depenses.donnees}
          cle={(d) => d.id}
          chargement={depenses.chargement}
          erreur={depenses.erreur}
          onReessayer={depenses.recharger}
          parPage={25}
          resume={(n) =>
            `${n} dépense${n > 1 ? 's' : ''} · ${montant((depenses.donnees ?? []).reduce((t, d) => t + d.montant, 0))}`
          }
          vide={
            <EtatVide
              icone="finance"
              titre="Aucune dépense sur cette période"
              action={
                session.peut('depenses.creer') ? (
                  <Bouton icone="plus" onClick={() => setSaisieDepense(true)}>
                    Enregistrer une dépense
                  </Bouton>
                ) : undefined
              }
            >
              Loyer, salaires, transport, électricité : enregistrez-les pour obtenir un résultat
              fiable.
            </EtatVide>
          }
        />
      ) : null}

      {saisieDepense ? (
        <FormulaireDepense
          onFermer={() => setSaisieDepense(false)}
          onEnregistre={() => {
            setSaisieDepense(false)
            depenses.recharger()
            synthese.recharger()
            signalerCaisseModifiee()
            notifications.succes('Dépense enregistrée')
          }}
        />
      ) : null}
    </>
  )
}

function FormulaireDepense({ onFermer, onEnregistre }: { onFermer: () => void; onEnregistre: () => void }) {
  const action = useAction()
  const categories = useRequete<{ id: number; nom: string }[]>('depenses.categories')

  const [d, setD] = useState({
    date: aujourdhui(),
    categorieId: 0,
    libelle: '',
    montant: 0,
    mode: 'especes' as 'especes' | 'mobile_money' | 'carte' | 'virement' | 'cheque',
    beneficiaire: '',
    note: ''
  })

  const valide = d.libelle.trim().length >= 3 && d.montant > 0 && d.categorieId > 0

  async function enregistrer(): Promise<void> {
    const r = await action.executer('depenses.enregistrer', {
      ...d,
      beneficiaire: d.beneficiaire.trim() || null,
      note: d.note.trim() || null,
      surCaisse: d.mode === 'especes'
    })
    if (r !== null) onEnregistre()
  }

  return (
    <Modale
      titre="Enregistrer une dépense"
      onFermer={onFermer}
      pied={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="principal" disabled={!valide} enCours={action.enCours} onClick={enregistrer}>
            Enregistrer
          </Bouton>
        </>
      }
    >
      <div className="panneau-corps pile">
        {action.erreur ? <Bandeau ton="danger">{action.erreur.message}</Bandeau> : null}

        <Champ
          libelle="Libellé"
          obligatoire
          value={d.libelle}
          onChange={(e) => setD({ ...d, libelle: e.target.value })}
          placeholder="Facture d’électricité — août"
          autoFocus
        />
        <div className="grille deux">
          <Liste
            libelle="Catégorie"
            obligatoire
            vide="Choisir…"
            options={(categories.donnees ?? []).map((c) => ({ valeur: c.id, libelle: c.nom }))}
            value={d.categorieId || ''}
            onChange={(e) => setD({ ...d, categorieId: Number(e.target.value) })}
          />
          <Champ
            libelle="Date"
            type="date"
            max={aujourdhui()}
            value={d.date}
            onChange={(e) => setD({ ...d, date: e.target.value })}
          />
          <ChampMontant
            libelle="Montant"
            obligatoire
            valeur={d.montant}
            onChangeValeur={(v) => setD({ ...d, montant: v })}
          />
          <Liste
            libelle="Mode de règlement"
            options={[
              { valeur: 'especes', libelle: 'Espèces (sur la caisse)' },
              { valeur: 'mobile_money', libelle: 'Mobile Money' },
              { valeur: 'virement', libelle: 'Virement' },
              { valeur: 'cheque', libelle: 'Chèque' },
              { valeur: 'carte', libelle: 'Carte' }
            ]}
            value={d.mode}
            onChange={(e) => setD({ ...d, mode: e.target.value as typeof d.mode })}
          />
        </div>

        {d.mode === 'especes' ? (
          <Bandeau ton="info">
            Cette dépense sera imputée sur la caisse ouverte et déduite du montant théorique à la
            clôture.
          </Bandeau>
        ) : null}

        <Champ
          libelle="Bénéficiaire"
          value={d.beneficiaire}
          onChange={(e) => setD({ ...d, beneficiaire: e.target.value })}
        />
        <ZoneTexte libelle="Note" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />
      </div>
    </Modale>
  )
}
