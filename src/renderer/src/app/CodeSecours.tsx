/**
 * Le code de secours : ce qu'on montre au pharmacien, et comment.
 *
 * Le code ne s'affiche qu'une fois. Passé cet écran, personne ne peut le
 * redonner — ni un administrateur, ni nous : la base n'en garde que
 * l'empreinte. Tout ici sert donc à ce qu'il soit réellement mis de côté :
 * il est écrit gros, il y a un bouton pour l'imprimer, et on ne peut pas
 * continuer sans avoir coché qu'il est rangé.
 *
 * La case à cocher n'est pas une formalité juridique. C'est la seule seconde
 * où quelqu'un regarde l'écran en sachant ce que ce code vaut.
 */
import { useState, type ReactNode } from 'react'
import { Bouton } from '../ui/Composants'
import Icone from '../ui/Icone'

export function PanneauCodeSecours({
  code,
  nomOfficine,
  pied
}: {
  code: string
  nomOfficine?: string
  /** Ce qui ferme l'écran : un bouton « Commencer », « Fermer »… */
  pied: (range: boolean) => ReactNode
}) {
  const [range, setRange] = useState(false)

  return (
    <div className="secours">
      <h2 className="secours-titre">Votre code de secours</h2>
      <p className="secours-texte">
        Si le mot de passe de ce compte est un jour perdu, ce code est la seule façon de rouvrir le
        logiciel. Imprimez-le et rangez-le hors de l’officine — chez vous, ou dans un coffre. Pas
        dans le tiroir de la caisse.
      </p>

      <div className="secours-cadre">
        {nomOfficine ? <div className="secours-officine">{nomOfficine}</div> : null}
        <div className="secours-code chiffres">{code}</div>
        <div className="secours-mention">PHARMINA — code de secours · à conserver</div>
      </div>

      <p className="secours-texte">
        Il ne sera plus affiché. Personne ne peut le retrouver à votre place, pas même l’éditeur :
        le logiciel n’en garde qu’une empreinte. C’est ce qui fait qu’un tiers ne peut pas l’obtenir
        non plus.
      </p>

      <div className="rangee secours-actions">
        <Bouton icone="imprimer" onClick={() => window.print()}>
          Imprimer
        </Bouton>
        <label className="secours-case">
          <input type="checkbox" checked={range} onChange={(e) => setRange(e.target.checked)} />
          <span>Je l’ai imprimé ou recopié, et rangé en lieu sûr.</span>
        </label>
      </div>

      <div className="rangee">{pied(range)}</div>
    </div>
  )
}

/** Le même code, dans une fenêtre, pour les écrans qui en délivrent un neuf. */
export function AvertissementCodeUnique() {
  return (
    <p className="secours-texte secours-unique">
      <Icone nom="alerte-cercle" taille={15} />
      Délivrer un code neuf annule le précédent. Si l’ancien papier circule encore, détruisez-le.
    </p>
  )
}
