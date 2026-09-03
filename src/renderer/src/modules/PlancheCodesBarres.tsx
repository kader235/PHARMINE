import { useMemo, useState } from 'react'
import { Bouton, Case, Chargement, EtatVide, Modale } from '../ui/Composants'
import { PlancheEtiquettes, CodeBarres } from '../ui/Documents'
import { useRequete } from '../lib/hooks'
import { useImpression } from '../ui/Impression'
import { montant } from '../lib/format'
import type { Pharmacie } from '@shared/types'

interface Etiquetable {
  produitId: number
  nom: string
  dosage: string | null
  code: string
  prixVente: number
  emplacement: string | null
}

/**
 * Choisir les étiquettes, puis imprimer la planche.
 *
 * POURQUOI UNE SÉLECTION ET PAS UN BOUTON « TOUT IMPRIMER »
 *
 * Une officine qui reprend son catalogue fabrique cent codes d'un coup. Les
 * imprimer tous ferait dix feuilles, dont neuf pour des boîtes déjà
 * étiquetées la semaine dernière. On coche ce qu'on colle aujourd'hui.
 *
 * Le nombre de feuilles est annoncé avant l'impression : dix étiquettes par
 * feuille, et le papier coûte cher.
 */
export function PlancheCodesBarres({ onFerme }: { onFerme: () => void }) {
  const liste = useRequete<Etiquetable[]>('produits.a_etiqueter', { limite: 300 })
  const pharmacie = useRequete<Pharmacie>('parametres.pharmacie')
  const impression = useImpression()

  const [choisis, setChoisis] = useState<Set<number>>(new Set())
  const [exemplaires, setExemplaires] = useState(1)

  const produits = liste.donnees ?? []

  const etiquettes = useMemo(() => {
    const retenus = produits.filter((p) => choisis.has(p.produitId))
    // Un même produit peut demander plusieurs étiquettes : une par boîte reçue.
    return retenus.flatMap((p) =>
      Array.from({ length: exemplaires }, () => ({
        code: p.code,
        nom: p.nom,
        dosage: p.dosage,
        prixVente: p.prixVente,
        emplacement: p.emplacement
      }))
    )
  }, [produits, choisis, exemplaires])

  const feuilles = Math.ceil(etiquettes.length / 10)

  function basculer(id: number): void {
    setChoisis((precedent) => {
      const suivant = new Set(precedent)
      if (suivant.has(id)) suivant.delete(id)
      else suivant.add(id)
      return suivant
    })
  }

  return (
    <Modale
      titre="Planche d’étiquettes"
      description="Dix étiquettes par feuille A4 : deux colonnes, cinq rangées. À découper et coller sur les boîtes."
      large
      onFermer={onFerme}
      pied={
        <>
          <span className="planche-compte">
            {etiquettes.length === 0
              ? 'Aucune étiquette choisie'
              : `${etiquettes.length} étiquette${etiquettes.length > 1 ? 's' : ''} · ${feuilles} feuille${feuilles > 1 ? 's' : ''} A4`}
          </span>
          <Bouton variante="discret" onClick={onFerme}>
            Fermer
          </Bouton>
          <Bouton
            variante="principal"
            icone="imprimer"
            disabled={etiquettes.length === 0}
            onClick={() =>
              impression.imprimer(
                <PlancheEtiquettes etiquettes={etiquettes} pharmacie={pharmacie.donnees} />,
                'a4'
              )
            }
          >
            Imprimer
          </Bouton>
        </>
      }
    >
      {liste.chargement && !liste.donnees ? (
        <Chargement libelle="Recherche des codes fabriqués…" />
      ) : produits.length === 0 ? (
        <EtatVide icone="code-barres" titre="Aucun code fabriqué">
          Les codes lus sur les boîtes sont déjà imprimés par le fabricant : ils n’ont pas besoin
          d’étiquette. Cette planche ne sert qu’aux codes que le logiciel a fabriqués, lors d’un
          enregistrement rapide sans code-barres.
        </EtatVide>
      ) : (
        <>
          <div className="planche-reglages">
            <div className="planche-choix-tous">
              <Bouton
                compact
                variante="discret"
                onClick={() => setChoisis(new Set(produits.map((p) => p.produitId)))}
              >
                Tout cocher
              </Bouton>
              <Bouton compact variante="discret" onClick={() => setChoisis(new Set())}>
                Tout décocher
              </Bouton>
            </div>

            <label className="planche-exemplaires">
              Exemplaires par produit
              <input
                type="number"
                min={1}
                max={20}
                value={exemplaires}
                onChange={(e) =>
                  setExemplaires(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
                }
              />
            </label>
          </div>

          <div className="planche-liste">
            {produits.map((p) => (
              <label
                key={p.produitId}
                className={`planche-ligne${choisis.has(p.produitId) ? ' choisie' : ''}`}
              >
                <Case
                  checked={choisis.has(p.produitId)}
                  onChange={() => basculer(p.produitId)}
                  libelle=""
                />
                <span className="planche-nom">
                  <strong>
                    {p.nom} {p.dosage ?? ''}
                  </strong>
                  <span>{[p.emplacement, montant(p.prixVente)].filter(Boolean).join(' · ')}</span>
                </span>
                {/* L'aperçu réel du code : on voit ce qu'on va coller. */}
                <CodeBarres code={p.code} hauteur={40} />
              </label>
            ))}
          </div>
        </>
      )}
    </Modale>
  )
}
