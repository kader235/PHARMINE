import { useEffect, useRef, useState } from 'react'
import type { ResultatRecherche } from '@shared/types'
import { appeler } from '../lib/api'
import { useDifferee, useRaccourci } from '../lib/hooks'
import Icone from '../ui/Icone'
import { useNavigation, type CleModule } from './navigation'

const GROUPES: { categorie: ResultatRecherche['categorie']; libelle: string; module: CleModule }[] = [
  { categorie: 'produit', libelle: 'Produits', module: 'produits' },
  { categorie: 'vente', libelle: 'Ventes', module: 'ventes' },
  { categorie: 'client', libelle: 'Clients', module: 'clients' },
  { categorie: 'fournisseur', libelle: 'Fournisseurs', module: 'fournisseurs' },
  { categorie: 'achat', libelle: 'Achats', module: 'achats' }
]

/**
 * Recherche globale. Les résultats sont regroupés par nature et parcourables
 * au clavier : on trouve une référence sans quitter le clavier ni l'écran
 * courant.
 */
export default function RechercheGlobale() {
  const [saisie, setSaisie] = useState('')
  const [resultats, setResultats] = useState<ResultatRecherche[]>([])
  const [ouvert, setOuvert] = useState(false)
  const [survol, setSurvol] = useState(0)
  const champ = useRef<HTMLInputElement>(null)
  const conteneur = useRef<HTMLDivElement>(null)
  const naviguer = useNavigation()
  const differee = useDifferee(saisie, 160)

  useRaccourci('k', () => champ.current?.focus(), true)

  useEffect(() => {
    if (differee.trim().length < 2) {
      setResultats([])
      return
    }
    let annule = false
    appeler<ResultatRecherche[]>('pilotage.recherche', { saisie: differee })
      .then((r) => {
        if (!annule) {
          setResultats(r)
          setSurvol(0)
        }
      })
      .catch(() => {
        if (!annule) setResultats([])
      })
    return () => {
      annule = true
    }
  }, [differee])

  useEffect(() => {
    const clicAilleurs = (e: MouseEvent) => {
      if (!conteneur.current?.contains(e.target as Node)) setOuvert(false)
    }
    document.addEventListener('mousedown', clicAilleurs)
    return () => document.removeEventListener('mousedown', clicAilleurs)
  }, [])

  function ouvrir(resultat: ResultatRecherche): void {
    const groupe = GROUPES.find((g) => g.categorie === resultat.categorie)
    if (!groupe) return
    naviguer({ module: groupe.module, cible: { type: resultat.categorie, id: resultat.id } })
    setOuvert(false)
    setSaisie('')
    champ.current?.blur()
  }

  function auClavier(e: React.KeyboardEvent): void {
    if (!resultats.length) {
      if (e.key === 'Escape') {
        setSaisie('')
        champ.current?.blur()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSurvol((s) => (s + 1) % resultats.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSurvol((s) => (s - 1 + resultats.length) % resultats.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const choisi = resultats[survol]
      if (choisi) ouvrir(choisi)
    } else if (e.key === 'Escape') {
      setOuvert(false)
      champ.current?.blur()
    }
  }

  const afficher = ouvert && saisie.trim().length >= 2
  let index = -1

  return (
    <div className="recherche-globale" ref={conteneur}>
      <div className="recherche-champ">
        <Icone nom="recherche" taille={14} />
        <input
          ref={champ}
          value={saisie}
          onChange={(e) => {
            setSaisie(e.target.value)
            setOuvert(true)
          }}
          onFocus={() => setOuvert(true)}
          onKeyDown={auClavier}
          placeholder="Rechercher un produit, un client…"
          aria-label="Recherche globale"
        />
        <span className="raccourci">Ctrl K</span>
      </div>

      {afficher ? (
        <div className="recherche-resultats">
          {resultats.length === 0 ? (
            <div style={{ padding: '18px 12px', textAlign: 'center', color: 'var(--texte-faible)', fontSize: 12.5 }}>
              Aucun résultat pour « {saisie.trim()} ».
            </div>
          ) : (
            GROUPES.map((groupe) => {
              const lignes = resultats.filter((r) => r.categorie === groupe.categorie)
              if (!lignes.length) return null
              return (
                <div key={groupe.categorie}>
                  <div className="recherche-groupe">{groupe.libelle}</div>
                  {lignes.map((resultat) => {
                    index++
                    const courant = index
                    return (
                      <button
                        key={`${resultat.categorie}-${resultat.id}`}
                        type="button"
                        className={`recherche-resultat${courant === survol ? ' survol' : ''}`}
                        onMouseEnter={() => setSurvol(courant)}
                        onClick={() => ouvrir(resultat)}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <strong>{resultat.titre}</strong>
                          <span>{resultat.sousTitre}</span>
                        </div>
                        {resultat.complement ? <span className="complement">{resultat.complement}</span> : null}
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}
