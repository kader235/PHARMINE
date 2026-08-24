import type { ReactElement } from 'react'

/**
 * Jeu d'icônes de l'application.
 *
 * Tracés SVG à 16 px, épaisseur 1.5, extrémités arrondies : un seul style pour
 * toute l'application. Aucun caractère Unicode détourné en icône, aucune
 * dépendance distante.
 */

export type NomIcone =
  | 'tableau-bord'
  | 'vente'
  | 'produit'
  | 'stock'
  | 'achat'
  | 'fournisseur'
  | 'client'
  | 'inventaire'
  | 'finance'
  | 'rapport'
  | 'alerte'
  | 'utilisateur'
  | 'journal'
  | 'parametres'
  | 'caisse'
  | 'recherche'
  | 'plus'
  | 'moins'
  | 'croix'
  | 'coche'
  | 'chevron-bas'
  | 'chevron-droit'
  | 'chevron-gauche'
  | 'fleche-haut'
  | 'fleche-bas'
  | 'fleche-droite'
  | 'triangle-alerte'
  | 'info'
  | 'horloge'
  | 'calendrier'
  | 'imprimer'
  | 'telecharger'
  | 'filtre'
  | 'tri'
  | 'corbeille'
  | 'crayon'
  | 'oeil'
  | 'verrou'
  | 'sortie'
  | 'sauvegarde'
  | 'panneau'
  | 'peremption'
  | 'etiquette'
  | 'boite-vide'
  | 'code-barres'

const TRACES: Record<NomIcone, ReactElement> = {
  'tableau-bord': (
    <>
      <rect x="2" y="2" width="5.5" height="6.5" rx="1" />
      <rect x="10.5" y="2" width="5.5" height="4" rx="1" />
      <rect x="2" y="11" width="5.5" height="4" rx="1" />
      <rect x="10.5" y="8.5" width="5.5" height="6.5" rx="1" />
    </>
  ),
  vente: (
    <>
      <path d="M1.6 2h2l1.6 8.2a1.4 1.4 0 0 0 1.4 1.1h6.2a1.4 1.4 0 0 0 1.4-1.1L15.4 5H4" />
      <circle cx="6.8" cy="14.2" r="1.1" />
      <circle cx="12.8" cy="14.2" r="1.1" />
    </>
  ),
  produit: (
    <>
      <path d="M14.5 5.2 8 2 1.5 5.2v5.6L8 14l6.5-3.2V5.2Z" />
      <path d="M1.7 5.3 8 8.4l6.3-3.1M8 8.4V14" />
    </>
  ),
  stock: (
    <>
      <path d="M8 1.8 1.6 5 8 8.2 14.4 5 8 1.8Z" />
      <path d="m1.6 11 6.4 3.2L14.4 11M1.6 8l6.4 3.2L14.4 8" />
    </>
  ),
  achat: (
    <>
      <path d="M1.6 4.2h7.6v6.6H1.6z" />
      <path d="M9.2 6.6h2.6l2.6 2.4v1.8H9.2z" />
      <circle cx="4.4" cy="12.6" r="1.4" />
      <circle cx="11.6" cy="12.6" r="1.4" />
    </>
  ),
  fournisseur: (
    <>
      <path d="M2.4 14.4V3.2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v11.2" />
      <path d="M10.4 6.8h2.6a1 1 0 0 1 1 1v6.6M1.2 14.4h13.6" />
      <path d="M4.8 5.4h1.2M4.8 8h1.2M4.8 10.6h1.2M7.8 5.4H9M7.8 8H9M7.8 10.6H9" />
    </>
  ),
  client: (
    <>
      <circle cx="6.2" cy="5.4" r="2.6" />
      <path d="M1.6 14a4.6 4.6 0 0 1 9.2 0" />
      <path d="M11 3.1a2.6 2.6 0 0 1 0 4.6M12.4 14a4.6 4.6 0 0 0-1.6-3.5" />
    </>
  ),
  inventaire: (
    <>
      <path d="M5.6 2.6H4.2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h7.6a1 1 0 0 0 1-1v-10a1 1 0 0 0-1-1h-1.4" />
      <rect x="5.6" y="1.4" width="4.8" height="2.4" rx=".8" />
      <path d="m5.9 9.4 1.5 1.5 2.8-3" />
    </>
  ),
  finance: (
    <>
      <path d="M1.8 12.4 5.9 8l2.7 2.6 5.6-6" />
      <path d="M10.6 4.6h3.6v3.5" />
      <path d="M1.8 14.4h12.4" />
    </>
  ),
  rapport: (
    <>
      <path d="M2.4 14.2h11.2" />
      <rect x="3" y="8.6" width="2.6" height="5.6" rx=".5" />
      <rect x="6.9" y="5" width="2.6" height="9.2" rx=".5" />
      <rect x="10.8" y="2.4" width="2.6" height="11.8" rx=".5" />
    </>
  ),
  alerte: (
    <>
      <path d="M12.6 6.4a4.6 4.6 0 1 0-9.2 0c0 4-1.6 5.2-1.6 5.2h12.4s-1.6-1.2-1.6-5.2Z" />
      <path d="M9.2 13.8a1.5 1.5 0 0 1-2.4 0" />
    </>
  ),
  utilisateur: (
    <>
      <path d="M8 1.6 2.6 3.8v4.1c0 3.2 2.3 5.6 5.4 6.5 3.1-.9 5.4-3.3 5.4-6.5V3.8L8 1.6Z" />
      <circle cx="8" cy="7" r="1.8" />
      <path d="M5.2 11.8a3 3 0 0 1 5.6 0" />
    </>
  ),
  journal: (
    <>
      <path d="M3 2.6h10M3 6h10M3 9.4h10M3 12.8h6.6" />
    </>
  ),
  parametres: (
    <>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M12.9 9.8a1.1 1.1 0 0 0 .2 1.2l.1.1a1.3 1.3 0 1 1-1.9 1.9l-.1-.1a1.1 1.1 0 0 0-1.2-.2 1.1 1.1 0 0 0-.7 1v.2a1.3 1.3 0 1 1-2.6 0v-.1a1.1 1.1 0 0 0-.7-1 1.1 1.1 0 0 0-1.2.2l-.1.1a1.3 1.3 0 1 1-1.9-1.9l.1-.1a1.1 1.1 0 0 0 .2-1.2 1.1 1.1 0 0 0-1-.7h-.2a1.3 1.3 0 0 1 0-2.6h.1a1.1 1.1 0 0 0 1-.7 1.1 1.1 0 0 0-.2-1.2l-.1-.1a1.3 1.3 0 1 1 1.9-1.9l.1.1a1.1 1.1 0 0 0 1.2.2h.1a1.1 1.1 0 0 0 .7-1v-.2a1.3 1.3 0 1 1 2.6 0v.1a1.1 1.1 0 0 0 .7 1 1.1 1.1 0 0 0 1.2-.2l.1-.1a1.3 1.3 0 1 1 1.9 1.9l-.1.1a1.1 1.1 0 0 0-.2 1.2v.1a1.1 1.1 0 0 0 1 .7h.2a1.3 1.3 0 1 1 0 2.6h-.1a1.1 1.1 0 0 0-1 .7Z" />
    </>
  ),
  caisse: (
    <>
      <rect x="1.6" y="3.8" width="12.8" height="8.4" rx="1.2" />
      <circle cx="8" cy="8" r="2" />
      <path d="M4.4 8h.1M11.5 8h.1" />
    </>
  ),
  recherche: (
    <>
      <circle cx="7.2" cy="7.2" r="4.6" />
      <path d="m10.6 10.6 3.4 3.4" />
    </>
  ),
  plus: <path d="M8 3.2v9.6M3.2 8h9.6" />,
  moins: <path d="M3.2 8h9.6" />,
  croix: <path d="M4 4l8 8M12 4l-8 8" />,
  coche: <path d="m3.4 8.4 3.2 3.2 6-6.8" />,
  'chevron-bas': <path d="m4 6 4 4 4-4" />,
  'chevron-droit': <path d="m6 4 4 4-4 4" />,
  'chevron-gauche': <path d="m10 4-4 4 4 4" />,
  'fleche-haut': <path d="M8 13V3M4 6.8 8 3l4 3.8" />,
  'fleche-bas': <path d="M8 3v10M4 9.2 8 13l4-3.8" />,
  'fleche-droite': <path d="M3 8h10M9.4 4l3.8 4-3.8 4" />,
  'triangle-alerte': (
    <>
      <path d="M7 2.5 1.4 12a1.1 1.1 0 0 0 1 1.7h11.2a1.1 1.1 0 0 0 1-1.7L9 2.5a1.1 1.1 0 0 0-2 0Z" />
      <path d="M8 6.2v3M8 11.4h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 11V7.6M8 5.2h.01" />
    </>
  ),
  horloge: (
    <>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 4.4V8l2.4 1.4" />
    </>
  ),
  calendrier: (
    <>
      <rect x="2.2" y="3.2" width="11.6" height="10.6" rx="1.2" />
      <path d="M2.2 6.4h11.6M5.4 1.8v2.6M10.6 1.8v2.6" />
    </>
  ),
  imprimer: (
    <>
      <path d="M4.4 6V2.2h7.2V6" />
      <path d="M4.4 11.6H3.2A1.2 1.2 0 0 1 2 10.4V7.2A1.2 1.2 0 0 1 3.2 6h9.6A1.2 1.2 0 0 1 14 7.2v3.2a1.2 1.2 0 0 1-1.2 1.2h-1.2" />
      <rect x="4.4" y="9.6" width="7.2" height="4.4" rx=".6" />
    </>
  ),
  telecharger: (
    <>
      <path d="M8 2.4v7.8M4.8 7.4 8 10.4l3.2-3" />
      <path d="M2.4 12.2v.8a1.4 1.4 0 0 0 1.4 1.4h8.4a1.4 1.4 0 0 0 1.4-1.4v-.8" />
    </>
  ),
  filtre: <path d="M1.8 3h12.4l-4.8 5.6v4.6l-2.8 1.4V8.6L1.8 3Z" />,
  tri: <path d="M5 3.6v8.8M2.8 10.2 5 12.4l2.2-2.2M11 12.4V3.6M8.8 5.8 11 3.6l2.2 2.2" />,
  corbeille: (
    <>
      <path d="M2.4 4.2h11.2M6 4.2V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.2" />
      <path d="M12.4 4.2v9a1.2 1.2 0 0 1-1.2 1.2H4.8a1.2 1.2 0 0 1-1.2-1.2v-9" />
      <path d="M6.6 7.2v4.2M9.4 7.2v4.2" />
    </>
  ),
  crayon: (
    <>
      <path d="M11.2 2.4a1.7 1.7 0 0 1 2.4 2.4L5 13.4l-3.2.8.8-3.2 8.6-8.6Z" />
      <path d="m10.2 3.4 2.4 2.4" />
    </>
  ),
  oeil: (
    <>
      <path d="M1.4 8S4 3.4 8 3.4 14.6 8 14.6 8 12 12.6 8 12.6 1.4 8 1.4 8Z" />
      <circle cx="8" cy="8" r="2.1" />
    </>
  ),
  verrou: (
    <>
      <rect x="3" y="7" width="10" height="7.2" rx="1.2" />
      <path d="M5.4 7V4.9a2.6 2.6 0 0 1 5.2 0V7" />
    </>
  ),
  sortie: (
    <>
      <path d="M6.2 14H3.4A1.4 1.4 0 0 1 2 12.6V3.4A1.4 1.4 0 0 1 3.4 2h2.8" />
      <path d="M10.4 11.2 13.6 8l-3.2-3.2M13.6 8H6.2" />
    </>
  ),
  sauvegarde: (
    <>
      <ellipse cx="8" cy="4" rx="5.6" ry="2.2" />
      <path d="M2.4 4v8c0 1.2 2.5 2.2 5.6 2.2s5.6-1 5.6-2.2V4" />
      <path d="M2.4 8c0 1.2 2.5 2.2 5.6 2.2s5.6-1 5.6-2.2" />
    </>
  ),
  panneau: (
    <>
      <rect x="1.8" y="2.6" width="12.4" height="10.8" rx="1.2" />
      <path d="M6.2 2.6v10.8" />
    </>
  ),
  peremption: (
    <>
      <circle cx="8" cy="8.6" r="5.4" />
      <path d="M8 5.8v3M8 11.2h.01M6 1.6h4" />
    </>
  ),
  etiquette: (
    <>
      <path d="M8.4 1.9H3.1a1.2 1.2 0 0 0-1.2 1.2v5.3a1.2 1.2 0 0 0 .35.85l5.3 5.3a1.2 1.2 0 0 0 1.7 0l4.55-4.55a1.2 1.2 0 0 0 0-1.7l-5.3-5.3a1.2 1.2 0 0 0-.85-.35Z" />
      <path d="M5.1 5.1h.01" />
    </>
  ),
  'boite-vide': (
    <>
      <path d="M1.8 5.4h12.4v7.4a1.2 1.2 0 0 1-1.2 1.2H3a1.2 1.2 0 0 1-1.2-1.2V5.4Z" />
      <path d="M1.4 5.4 3 2.4h10l1.6 3M6.4 8.6h3.2" />
    </>
  ),
  'code-barres': (
    <>
      <path d="M2.4 3.6v8.8M4.6 3.6v8.8M6.6 3.6v8.8M9 3.6v8.8M11.4 3.6v8.8M13.6 3.6v8.8" />
    </>
  )
}

interface Props {
  nom: NomIcone
  taille?: number
  className?: string
  /** Icônes purement décoratives : masquées aux lecteurs d'écran. */
  titre?: string
}

export default function Icone({ nom, taille = 16, className, titre }: Props): ReactElement {
  return (
    <svg
      className={className}
      width={taille}
      height={taille}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={titre ? 'img' : undefined}
      aria-hidden={titre ? undefined : true}
      aria-label={titre}
      focusable="false"
    >
      {titre ? <title>{titre}</title> : null}
      {TRACES[nom]}
    </svg>
  )
}
