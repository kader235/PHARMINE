/**
 * Signaux internes a l'interface.
 *
 * La barre d'etat vit dans la coque, mais c'est le comptoir ou l'ecran de
 * caisse qui modifient la caisse. Plutot que de faire remonter des rappels a
 * travers toute l'arborescence, on emet un evenement : la coque ecoute et se
 * rafraichit. Le mecanisme reste local a la fenetre.
 */
const CAISSE_MODIFIEE = 'pharmina:caisse-modifiee'

export function signalerCaisseModifiee(): void {
  window.dispatchEvent(new CustomEvent(CAISSE_MODIFIEE))
}

export function ecouterCaisseModifiee(rappel: () => void): () => void {
  window.addEventListener(CAISSE_MODIFIEE, rappel)
  return () => window.removeEventListener(CAISSE_MODIFIEE, rappel)
}
