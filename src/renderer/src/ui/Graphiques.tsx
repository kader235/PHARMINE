import { useId, type ReactNode } from 'react'

/**
 * Graphiques.
 *
 * Tracés en SVG, sans bibliothèque : les besoins sont simples et une
 * dépendance de plus alourdirait l'installateur sans rien apporter.
 *
 * Parti pris de lisibilité : une seule famille de couleurs, déclinée en
 * nuances. Un graphique où chaque série a sa teinte oblige à faire
 * l'aller-retour avec la légende ; des nuances d'une même couleur se lisent
 * dans l'ordre, ce qui est exactement ce qu'on demande à une répartition.
 */

/** Nuances du vert d'officine, de la plus soutenue à la plus pâle. */
export const NUANCES = ['#15654e', '#2c7d63', '#4a9781', '#72b09d', '#9ec8ba', '#c6ded5']

function nuance(index: number): string {
  return NUANCES[index % NUANCES.length]!
}

// ---------------------------------------------------------------------------
// Courbe d'évolution
// ---------------------------------------------------------------------------

export function Evolution({
  donnees,
  hauteur = 96,
  formatValeur,
  formatLibelle
}: {
  donnees: { libelle: string; valeur: number }[]
  hauteur?: number
  formatValeur: (v: number) => string
  formatLibelle?: (libelle: string, index: number) => string | null
}) {
  const id = useId()
  if (donnees.length < 2) return <VideGraphique />

  const maximum = Math.max(...donnees.map((d) => d.valeur), 1)
  const largeur = 100
  const pas = largeur / (donnees.length - 1)

  const points = donnees.map((d, i) => ({
    x: i * pas,
    y: hauteur - (d.valeur / maximum) * (hauteur - 12) - 4
  }))

  const ligne = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
  const aire = `${ligne} L${largeur} ${hauteur} L0 ${hauteur} Z`

  return (
    <div className="graphique">
      <svg
        viewBox={`0 0 ${largeur} ${hauteur}`}
        preserveAspectRatio="none"
        className="graphique-trace"
        style={{ height: hauteur }}
        role="img"
        aria-label="Évolution du chiffre d’affaires"
      >
        <defs>
          <linearGradient id={`degrade-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={NUANCES[0]} stopOpacity="0.16" />
            <stop offset="100%" stopColor={NUANCES[0]} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <path d={aire} fill={`url(#degrade-${id})`} />
        <path
          d={ligne}
          fill="none"
          stroke={NUANCES[0]}
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) =>
          i === points.length - 1 ? (
            <circle key={i} cx={p.x} cy={p.y} r="2.4" fill={NUANCES[0]} vectorEffect="non-scaling-stroke" />
          ) : null
        )}
      </svg>

      <div className="graphique-axe">
        {donnees.map((d, i) => {
          const texte = formatLibelle ? formatLibelle(d.libelle, i) : d.libelle
          return (
            <span key={d.libelle} title={`${d.libelle} — ${formatValeur(d.valeur)}`}>
              {texte}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Barres verticales
// ---------------------------------------------------------------------------

export function Barres({
  donnees,
  hauteur = 110,
  formatValeur
}: {
  donnees: { libelle: string; valeur: number }[]
  hauteur?: number
  formatValeur: (v: number) => string
}) {
  if (!donnees.length) return <VideGraphique />
  const maximum = Math.max(...donnees.map((d) => d.valeur), 1)

  return (
    <div className="graphique-barres" style={{ height: hauteur }}>
      {donnees.map((d, i) => (
        <div className="graphique-barre" key={d.libelle} title={`${d.libelle} — ${formatValeur(d.valeur)}`}>
          <span className="graphique-barre-valeur">{d.valeur > 0 ? formatValeur(d.valeur) : ''}</span>
          <span
            className="graphique-barre-corps"
            style={{
              height: `${Math.max(2, (d.valeur / maximum) * 100)}%`,
              background: nuance(i)
            }}
          />
          <span className="graphique-barre-libelle">{d.libelle}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Classement à barres horizontales
// ---------------------------------------------------------------------------

export function Classement({
  donnees,
  formatValeur
}: {
  donnees: { libelle: string; valeur: number; complement?: string }[]
  formatValeur: (v: number) => string
}) {
  if (!donnees.length) return <VideGraphique />
  const maximum = Math.max(...donnees.map((d) => d.valeur), 1)

  return (
    <ol className="classement">
      {donnees.map((d, i) => (
        <li key={d.libelle}>
          <span className="classement-rang">{i + 1}</span>
          <span className="classement-nom" title={d.libelle}>
            {d.libelle}
          </span>
          <span className="classement-jauge">
            <span style={{ width: `${(d.valeur / maximum) * 100}%`, background: nuance(i) }} />
          </span>
          <span className="classement-valeur">{formatValeur(d.valeur)}</span>
          {d.complement ? <span className="classement-complement">{d.complement}</span> : null}
        </li>
      ))}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// Répartition
// ---------------------------------------------------------------------------

/**
 * Barre empilée plutôt que camembert : à part égale, l'œil compare des
 * longueurs bien plus précisément que des angles, et les libellés tiennent
 * sans traits de rappel.
 */
export function Repartition({
  parts,
  formatValeur
}: {
  parts: { libelle: string; valeur: number }[]
  formatValeur: (v: number) => string
}) {
  const total = parts.reduce((s, p) => s + p.valeur, 0)
  if (!parts.length || total === 0) return <VideGraphique />

  return (
    <div className="repartition">
      <div className="repartition-barre">
        {parts.map((p, i) => (
          <span
            key={p.libelle}
            style={{ width: `${(p.valeur / total) * 100}%`, background: nuance(i) }}
            title={`${p.libelle} — ${formatValeur(p.valeur)}`}
          />
        ))}
      </div>
      <ul className="repartition-legende">
        {parts.map((p, i) => (
          <li key={p.libelle}>
            <span className="repartition-puce" style={{ background: nuance(i) }} />
            <span className="repartition-nom">{p.libelle}</span>
            <span className="repartition-part">{Math.round((p.valeur / total) * 100)} %</span>
            <span className="repartition-valeur">{formatValeur(p.valeur)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Anneau de progression
// ---------------------------------------------------------------------------

/** Un anneau ne se justifie que pour une part d'un tout : taux, remplissage. */
export function Anneau({
  valeur,
  total,
  libelle,
  taille = 84
}: {
  valeur: number
  total: number
  libelle?: ReactNode
  taille?: number
}) {
  const part = total > 0 ? Math.min(1, Math.max(0, valeur / total)) : 0
  const rayon = 16
  const circonference = 2 * Math.PI * rayon

  return (
    <div className="anneau" style={{ width: taille }}>
      <svg viewBox="0 0 40 40" width={taille} height={taille} role="img" aria-label={`${Math.round(part * 100)} %`}>
        <circle cx="20" cy="20" r={rayon} fill="none" stroke="var(--bordure)" strokeWidth="4" />
        <circle
          cx="20"
          cy="20"
          r={rayon}
          fill="none"
          stroke={NUANCES[0]}
          strokeWidth="4"
          strokeLinecap="butt"
          strokeDasharray={`${part * circonference} ${circonference}`}
          transform="rotate(-90 20 20)"
        />
        <text x="20" y="21.5" textAnchor="middle" className="anneau-texte">
          {Math.round(part * 100)}%
        </text>
      </svg>
      {libelle ? <div className="anneau-libelle">{libelle}</div> : null}
    </div>
  )
}

function VideGraphique() {
  return <div className="graphique-vide">Aucune donnée sur cette période.</div>
}
