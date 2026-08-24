import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes
} from 'react'
import Icone, { type NomIcone } from './Icone'
import { montant as formaterMontant, symboleDevise, versEntier } from '../lib/format'

export type Ton = 'succes' | 'attention' | 'danger' | 'info' | 'neutre'

// ---------------------------------------------------------------------------
// Boutons
// ---------------------------------------------------------------------------

interface BoutonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: 'normal' | 'principal' | 'danger' | 'discret'
  icone?: NomIcone
  compact?: boolean
  pleine?: boolean
  enCours?: boolean
}

export function Bouton({
  variante = 'normal',
  icone,
  compact,
  pleine,
  enCours,
  children,
  className = '',
  disabled,
  ...reste
}: BoutonProps) {
  const classes = [
    'bouton',
    variante !== 'normal' ? variante : '',
    compact ? 'compact' : '',
    pleine ? 'pleine' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button className={classes} disabled={disabled || enCours} {...reste}>
      {enCours ? <span className="rotateur" style={{ width: 13, height: 13 }} /> : icone ? <Icone nom={icone} /> : null}
      {children}
    </button>
  )
}

export function BoutonIcone({
  icone,
  titre,
  point,
  ...reste
}: ButtonHTMLAttributes<HTMLButtonElement> & { icone: NomIcone; titre: string; point?: boolean }) {
  return (
    <button className="bouton-icone" title={titre} aria-label={titre} {...reste}>
      <Icone nom={icone} />
      {point ? <span className="point" /> : null}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Affichage d'état
// ---------------------------------------------------------------------------

export function Etiquette({
  ton = 'neutre',
  children,
  sansPoint
}: {
  ton?: Ton
  children: ReactNode
  sansPoint?: boolean
}) {
  return <span className={`etiquette ${ton}${sansPoint ? ' sans-point' : ''}`}>{children}</span>
}

const ICONE_BANDEAU: Record<Ton, NomIcone> = {
  succes: 'coche',
  attention: 'triangle-alerte',
  danger: 'triangle-alerte',
  info: 'info',
  neutre: 'info'
}

export function Bandeau({
  ton = 'info',
  titre,
  children,
  action
}: {
  ton?: Ton
  titre?: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className={`bandeau ${ton}`}>
      <Icone nom={ICONE_BANDEAU[ton]} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {titre ? <strong>{titre}</strong> : null}
        {children ? <p>{children}</p> : null}
      </div>
      {action}
    </div>
  )
}

/**
 * État vide. Il explique la situation et propose l'action suivante — il ne se
 * contente jamais d'un tableau sans lignes.
 */
export function EtatVide({
  icone = 'boite-vide',
  titre,
  children,
  action
}: {
  icone?: NomIcone
  titre: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="etat-vide">
      <span className="etat-vide-icone">
        <Icone nom={icone} taille={19} />
      </span>
      <strong>{titre}</strong>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  )
}

export function Chargement({ libelle = 'Chargement…' }: { libelle?: string }) {
  return (
    <div className="chargement">
      <span className="rotateur" />
      {libelle}
    </div>
  )
}

export function ErreurEcran({
  erreur,
  onReessayer
}: {
  erreur: { message: string; detail?: string }
  onReessayer?: () => void
}) {
  return (
    <div className="etat-vide">
      <span className="etat-vide-icone" style={{ background: 'var(--danger-fond)', color: 'var(--danger)' }}>
        <Icone nom="triangle-alerte" taille={19} />
      </span>
      <strong>{erreur.message}</strong>
      {erreur.detail ? <p>{erreur.detail}</p> : null}
      {onReessayer ? (
        <Bouton onClick={onReessayer} icone="fleche-droite">
          Réessayer
        </Bouton>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

export function Panneau({
  titre,
  description,
  actions,
  children,
  pied,
  sansCorps
}: {
  titre?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  pied?: ReactNode
  sansCorps?: boolean
}) {
  return (
    <section className="panneau">
      {titre || actions ? (
        <header className="panneau-entete">
          <div>
            {titre ? <h2>{titre}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="rangee">{actions}</div> : null}
        </header>
      ) : null}
      {sansCorps ? children : <div className="panneau-corps">{children}</div>}
      {pied ? <footer className="panneau-pied">{pied}</footer> : null}
    </section>
  )
}

export function EntetePage({
  titre,
  description,
  actions
}: {
  titre: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="page-entete">
      <div>
        <h1>{titre}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  )
}

/**
 * Indicateur chiffré. La comparaison n'est affichée que si une valeur de
 * référence existe réellement — pas de « +12,5 % » inventé.
 */
export function Indicateur({
  libelle,
  valeur,
  unite,
  variation,
  comparaison = 'vs hier',
  detail,
  ton
}: {
  libelle: string
  valeur: string
  unite?: string
  variation?: number | null
  comparaison?: string
  detail?: ReactNode
  ton?: Ton
}) {
  const sens = variation === null || variation === undefined ? null : variation > 0 ? 'hausse' : variation < 0 ? 'baisse' : 'stable'

  return (
    <article className="indicateur">
      <div className="indicateur-libelle">{libelle}</div>
      <div className="indicateur-valeur chiffres" style={ton === 'danger' ? { color: 'var(--danger)' } : undefined}>
        {valeur}
        {unite ? <span className="unite">{unite}</span> : null}
      </div>
      <div className="indicateur-pied">
        {sens ? (
          <span className={`variation ${sens}`}>
            {sens !== 'stable' ? <Icone nom={sens === 'hausse' ? 'fleche-haut' : 'fleche-bas'} taille={12} /> : null}
            {variation! > 0 ? '+' : ''}
            {variation!.toFixed(1).replace('.', ',')} %
          </span>
        ) : null}
        {sens ? <span>{comparaison}</span> : detail ?? <span>Aucune comparaison disponible</span>}
      </div>
    </article>
  )
}

export function Segments<T extends string>({
  valeur,
  options,
  onChange
}: {
  valeur: T
  options: { valeur: T; libelle: string }[]
  onChange: (valeur: T) => void
}) {
  return (
    <div className="segments" role="group">
      {options.map((option) => (
        <button
          key={option.valeur}
          type="button"
          className={option.valeur === valeur ? 'actif' : ''}
          aria-pressed={option.valeur === valeur}
          onClick={() => onChange(option.valeur)}
        >
          {option.libelle}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Champs de formulaire
// ---------------------------------------------------------------------------

interface BaseChamp {
  libelle: string
  aide?: string
  erreur?: string
  obligatoire?: boolean
  large?: boolean
}

export function Champ({
  libelle,
  aide,
  erreur,
  obligatoire,
  large,
  ...reste
}: BaseChamp & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <div className={`champ${large ? ' large' : ''}`}>
      <label htmlFor={id}>
        {libelle}
        {obligatoire ? <span className="obligatoire">*</span> : null}
      </label>
      <input id={id} aria-invalid={erreur ? true : undefined} {...reste} />
      {erreur ? <span className="erreur">{erreur}</span> : aide ? <span className="aide">{aide}</span> : null}
    </div>
  )
}

/** Saisie monétaire : l'utilisateur tape des unités, le métier reçoit un entier. */
export function ChampMontant({
  libelle,
  aide,
  erreur,
  obligatoire,
  large,
  valeur,
  onChangeValeur,
  ...reste
}: BaseChamp & {
  valeur: number
  onChangeValeur: (valeur: number) => void
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const id = useId()
  return (
    <div className={`champ${large ? ' large' : ''}`}>
      <label htmlFor={id}>
        {libelle}
        {obligatoire ? <span className="obligatoire">*</span> : null}
      </label>
      <div className="champ-montant">
        <input
          id={id}
          inputMode="decimal"
          value={formaterMontant(valeur, false)}
          aria-invalid={erreur ? true : undefined}
          onChange={(e) => onChangeValeur(versEntier(e.target.value))}
          {...reste}
        />
        <span className="devise">{symboleDevise()}</span>
      </div>
      {erreur ? <span className="erreur">{erreur}</span> : aide ? <span className="aide">{aide}</span> : null}
    </div>
  )
}

export function Liste({
  libelle,
  aide,
  erreur,
  obligatoire,
  large,
  options,
  vide,
  ...reste
}: BaseChamp & {
  options: { valeur: string | number; libelle: string }[]
  vide?: string
} & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId()
  return (
    <div className={`champ${large ? ' large' : ''}`}>
      <label htmlFor={id}>
        {libelle}
        {obligatoire ? <span className="obligatoire">*</span> : null}
      </label>
      <select id={id} aria-invalid={erreur ? true : undefined} {...reste}>
        {vide !== undefined ? <option value="">{vide}</option> : null}
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur}>
            {o.libelle}
          </option>
        ))}
      </select>
      {erreur ? <span className="erreur">{erreur}</span> : aide ? <span className="aide">{aide}</span> : null}
    </div>
  )
}

export function ZoneTexte({
  libelle,
  aide,
  erreur,
  obligatoire,
  large,
  ...reste
}: BaseChamp & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId()
  return (
    <div className={`champ${large ? ' large' : ''}`}>
      <label htmlFor={id}>
        {libelle}
        {obligatoire ? <span className="obligatoire">*</span> : null}
      </label>
      <textarea id={id} aria-invalid={erreur ? true : undefined} {...reste} />
      {erreur ? <span className="erreur">{erreur}</span> : aide ? <span className="aide">{aide}</span> : null}
    </div>
  )
}

export function Case({
  libelle,
  description,
  ...reste
}: { libelle: string; description?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="case">
      <input type="checkbox" {...reste} />
      <span className="case-texte">
        <strong>{libelle}</strong>
        {description ? <span>{description}</span> : null}
      </span>
    </label>
  )
}

// ---------------------------------------------------------------------------
// Modale
// ---------------------------------------------------------------------------

export function Modale({
  titre,
  description,
  children,
  pied,
  onFermer,
  large
}: {
  titre: string
  description?: string
  children: ReactNode
  pied?: ReactNode
  onFermer: () => void
  large?: boolean
}) {
  const conteneur = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const gerer = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onFermer()
      }
    }
    document.addEventListener('keydown', gerer)

    // Le premier champ reçoit le focus : la saisie commence sans passer par la souris.
    const premier = conteneur.current?.querySelector<HTMLElement>(
      'input:not([type=hidden]), select, textarea'
    )
    premier?.focus()

    return () => document.removeEventListener('keydown', gerer)
  }, [onFermer])

  return (
    <div
      className="voile"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFermer()
      }}
    >
      <div
        className={`modale${large ? ' large' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        ref={conteneur}
      >
        <header className="modale-entete">
          <div>
            <h2>{titre}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <BoutonIcone icone="croix" titre="Fermer" onClick={onFermer} />
        </header>
        <div className="modale-corps">{children}</div>
        {pied ? <footer className="modale-pied">{pied}</footer> : null}
      </div>
    </div>
  )
}

/**
 * Confirmation. Une opération destructrice ne doit jamais se déclencher au
 * premier clic ; le libellé rappelle ce qui va se passer.
 */
export function Confirmation({
  titre,
  message,
  detail,
  libelleAction = 'Confirmer',
  danger,
  enCours,
  onConfirmer,
  onAnnuler
}: {
  titre: string
  message: string
  detail?: ReactNode
  libelleAction?: string
  danger?: boolean
  enCours?: boolean
  onConfirmer: () => void
  onAnnuler: () => void
}) {
  return (
    <Modale
      titre={titre}
      onFermer={onAnnuler}
      pied={
        <>
          <Bouton onClick={onAnnuler}>Annuler</Bouton>
          <Bouton variante={danger ? 'danger' : 'principal'} onClick={onConfirmer} enCours={enCours}>
            {libelleAction}
          </Bouton>
        </>
      }
    >
      <div className="panneau-corps">
        <p style={{ fontSize: 13 }}>{message}</p>
        {detail ? <div style={{ marginTop: 12 }}>{detail}</div> : null}
      </div>
    </Modale>
  )
}
