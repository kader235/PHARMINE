import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'

export interface ToucheFonction {
  /** Nom de la touche tel que le renvoie l'événement clavier : 'F2', 'F9'… */
  touche: string
  libelle: string
  action: () => void
  /** Faux : la touche reste affichée mais grisée, pour que la barre ne bouge pas. */
  disponible?: boolean
  /** Action principale du module, mise en évidence. */
  saillante?: boolean
}

interface Contexte {
  touches: ToucheFonction[]
  declarer: (cle: string, touches: ToucheFonction[]) => void
  retirer: (cle: string) => void
}

const ContexteFonctions = createContext<Contexte | null>(null)

/**
 * Les touches de fonction sont déclarées par l'écran courant, pas par la coque.
 * Chaque module sait seul ce que F2 doit faire chez lui ; la barre se contente
 * de les afficher et le clavier de les déclencher.
 */
export function FournisseurFonctions({ children }: { children: ReactNode }) {
  const [registre, setRegistre] = useState<{ cle: string; touches: ToucheFonction[] } | null>(null)

  // Ces deux fonctions doivent rester stables : elles figurent dans les
  // dépendances des écrans qui déclarent leurs touches.
  const declarer = useCallback(
    (cle: string, touches: ToucheFonction[]) => setRegistre({ cle, touches }),
    []
  )
  const retirer = useCallback(
    (cle: string) => setRegistre((r) => (r?.cle === cle ? null : r)),
    []
  )

  const valeur = useMemo<Contexte>(
    () => ({ touches: registre?.touches ?? [], declarer, retirer }),
    [registre, declarer, retirer]
  )

  // Le déclenchement au clavier vit ici : il reste actif quel que soit
  // l'élément qui a le focus, y compris un champ de saisie.
  const touchesCourantes = useRef<ToucheFonction[]>([])
  touchesCourantes.current = valeur.touches

  useEffect(() => {
    const gerer = (e: KeyboardEvent) => {
      if (!/^F\d{1,2}$/.test(e.key)) return
      const touche = touchesCourantes.current.find((t) => t.touche === e.key)
      if (!touche || touche.disponible === false) return
      e.preventDefault()
      touche.action()
    }
    window.addEventListener('keydown', gerer)
    return () => window.removeEventListener('keydown', gerer)
  }, [])

  return <ContexteFonctions.Provider value={valeur}>{children}</ContexteFonctions.Provider>
}

function useContexteFonctions(): Contexte {
  const contexte = useContext(ContexteFonctions)
  if (!contexte) throw new Error('useFonctions doit être utilisé dans FournisseurFonctions.')
  return contexte
}

/**
 * Déclare les touches de fonction de l'écran courant.
 *
 * `cle` identifie l'écran : au démontage, ses touches disparaissent sans
 * effacer celles d'un écran qui aurait pris le relais entre-temps.
 */
export function useFonctions(cle: string, touches: ToucheFonction[]): void {
  const { declarer, retirer } = useContexteFonctions()

  // La signature ignore les fonctions : sans cela, une barre se redéclarerait
  // à chaque rendu puisque les gestionnaires sont recréés à chaque fois.
  const signature = touches
    .map((t) => `${t.touche}|${t.libelle}|${t.disponible !== false}|${t.saillante ?? false}`)
    .join('~')

  const dernieres = useRef(touches)
  dernieres.current = touches

  useEffect(() => {
    declarer(cle, dernieres.current)
    return () => retirer(cle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, signature])
}

export function useBarreFonctions(): ToucheFonction[] {
  return useContexteFonctions().touches
}
