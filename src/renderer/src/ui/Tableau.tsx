import { useMemo, useState, type ReactNode } from 'react'
import Icone from './Icone'
import { Bouton, Chargement, ErreurEcran } from './Composants'
import type { ErreurAffichable } from '../lib/api'

export interface Colonne<T> {
  cle: string
  entete: string
  /** Contenu de la cellule. Par défaut, la valeur brute de `cle`. */
  rendu?: (ligne: T, index: number) => ReactNode
  /** Aligne à droite et met les chiffres en chasse fixe. */
  nombre?: boolean
  /** Valeur servant au tri. Rend la colonne triable. */
  triSur?: (ligne: T) => string | number | null
  largeur?: string
  /** Colonne d'actions : alignée à droite, non triable. */
  actions?: boolean
}

interface Props<T> {
  colonnes: Colonne<T>[]
  lignes: T[] | null
  cle: (ligne: T) => string | number
  chargement?: boolean
  erreur?: ErreurAffichable | null
  onReessayer?: () => void
  /** Affiché lorsqu'il n'y a aucune ligne. Obligatoire : un tableau vide doit s'expliquer. */
  vide: ReactNode
  /** Affiché lorsqu'un filtre ne renvoie rien, si différent de l'état vide initial. */
  videApresFiltre?: ReactNode
  filtreActif?: boolean
  outils?: ReactNode
  onLigneClic?: (ligne: T) => void
  ligneSelectionnee?: (ligne: T) => boolean
  parPage?: number
  triInitial?: { cle: string; sens: 'asc' | 'desc' }
  /** Texte du pied. Par défaut : « N élément(s) ». */
  resume?: (total: number) => string
  hauteurMax?: number
}

export default function Tableau<T>({
  colonnes,
  lignes,
  cle,
  chargement,
  erreur,
  onReessayer,
  vide,
  videApresFiltre,
  filtreActif,
  outils,
  onLigneClic,
  ligneSelectionnee,
  parPage = 0,
  triInitial,
  resume,
  hauteurMax
}: Props<T>) {
  const [tri, setTri] = useState(triInitial ?? null)
  const [page, setPage] = useState(1)

  const triees = useMemo(() => {
    if (!lignes) return []
    if (!tri) return lignes

    const colonne = colonnes.find((c) => c.cle === tri.cle)
    if (!colonne?.triSur) return lignes

    const copie = [...lignes]
    copie.sort((a, b) => {
      const va = colonne.triSur!(a)
      const vb = colonne.triSur!(b)
      if (va === vb) return 0
      if (va === null || va === undefined) return 1
      if (vb === null || vb === undefined) return -1
      const ordre = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'fr')
      return tri.sens === 'asc' ? ordre : -ordre
    })
    return copie
  }, [lignes, tri, colonnes])

  const total = triees.length
  const nbPages = parPage > 0 ? Math.max(1, Math.ceil(total / parPage)) : 1
  const pageCourante = Math.min(page, nbPages)
  const affichees = parPage > 0 ? triees.slice((pageCourante - 1) * parPage, pageCourante * parPage) : triees

  function basculerTri(colonne: Colonne<T>): void {
    if (!colonne.triSur) return
    setPage(1)
    setTri((precedent) =>
      precedent?.cle === colonne.cle
        ? { cle: colonne.cle, sens: precedent.sens === 'asc' ? 'desc' : 'asc' }
        : { cle: colonne.cle, sens: 'asc' }
    )
  }

  let corps: ReactNode

  if (erreur) {
    corps = <ErreurEcran erreur={erreur} onReessayer={onReessayer} />
  } else if (chargement && !lignes) {
    corps = <Chargement />
  } else if (total === 0) {
    corps = filtreActif && videApresFiltre ? videApresFiltre : vide
  } else {
    corps = (
      <>
        <div className="tableau-defilement" style={hauteurMax ? { maxHeight: hauteurMax, overflowY: 'auto' } : undefined}>
          <table className="tableau">
            <thead>
              <tr>
                {colonnes.map((colonne) => (
                  <th
                    key={colonne.cle}
                    style={colonne.largeur ? { width: colonne.largeur } : undefined}
                    className={[
                      colonne.triSur ? 'triable' : '',
                      colonne.nombre ? 'cellule-nombre' : '',
                      colonne.actions ? 'cellule-actions' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => basculerTri(colonne)}
                    aria-sort={
                      tri?.cle === colonne.cle ? (tri.sens === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                  >
                    {colonne.entete}
                    {colonne.triSur ? (
                      <Icone
                        nom={tri?.cle === colonne.cle ? (tri.sens === 'asc' ? 'fleche-haut' : 'fleche-bas') : 'tri'}
                        taille={11}
                        className="indicateur-tri"
                      />
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {affichees.map((ligne, index) => (
                <tr
                  key={cle(ligne)}
                  className={[
                    onLigneClic ? 'cliquable' : '',
                    ligneSelectionnee?.(ligne) ? 'selectionnee' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={onLigneClic ? () => onLigneClic(ligne) : undefined}
                >
                  {colonnes.map((colonne) => (
                    <td
                      key={colonne.cle}
                      className={[colonne.nombre ? 'cellule-nombre' : '', colonne.actions ? 'cellule-actions' : '']
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {colonne.rendu
                        ? colonne.rendu(ligne, index)
                        : String((ligne as Record<string, unknown>)[colonne.cle] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="tableau-pied">
          <span>{resume ? resume(total) : `${total} élément${total > 1 ? 's' : ''}`}</span>
          {nbPages > 1 ? (
            <div className="pagination">
              <Bouton
                compact
                variante="discret"
                icone="chevron-gauche"
                disabled={pageCourante === 1}
                onClick={() => setPage(pageCourante - 1)}
                aria-label="Page précédente"
              />
              <span>
                Page {pageCourante} sur {nbPages}
              </span>
              <Bouton
                compact
                variante="discret"
                icone="chevron-droit"
                disabled={pageCourante === nbPages}
                onClick={() => setPage(pageCourante + 1)}
                aria-label="Page suivante"
              />
            </div>
          ) : null}
        </div>
      </>
    )
  }

  return (
    <section className="panneau">
      {outils ? <div className="tableau-outils">{outils}</div> : null}
      {corps}
    </section>
  )
}

/** Champ de recherche employé dans les barres d'outils de tableau. */
export function RechercheTableau({
  valeur,
  onChange,
  placeholder = 'Rechercher…',
  largeur = 280
}: {
  valeur: string
  onChange: (valeur: string) => void
  placeholder?: string
  largeur?: number
}) {
  return (
    <div className="recherche-champ" style={{ width: largeur }}>
      <Icone nom="recherche" taille={14} />
      <input
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {valeur ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Effacer la recherche"
          style={{ border: 0, background: 'transparent', color: 'inherit', padding: 0, display: 'grid' }}
        >
          <Icone nom="croix" taille={13} />
        </button>
      ) : null}
    </div>
  )
}

/** Cellule à deux niveaux : libellé principal et précision en dessous. */
export function CellulePrincipale({ titre, sous }: { titre: ReactNode; sous?: ReactNode }) {
  return (
    <div className="cellule-principale">
      <strong>{titre}</strong>
      {sous ? <span>{sous}</span> : null}
    </div>
  )
}
