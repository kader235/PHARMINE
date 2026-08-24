import type { EtatCaisse } from '@shared/types'
import { useBarreFonctions } from './fonctions'
import { useSession } from './Session'
import { heure, montant } from '../lib/format'

/**
 * Barre de touches de fonction.
 *
 * Toujours présente, même quand un module ne propose rien : sa disparition
 * ferait sauter la mise en page et déplacerait tout le contenu au-dessus.
 */
export function BarreFonctions() {
  const touches = useBarreFonctions()

  return (
    <div className="barre-fonctions" role="toolbar" aria-label="Touches de fonction">
      {touches.length === 0 ? (
        <span className="touche-fonction" style={{ opacity: 0.4 }}>
          Aucune action rapide sur cet écran
        </span>
      ) : (
        touches.map((t) => (
          <button
            key={t.touche}
            type="button"
            className={`touche-fonction${t.saillante ? ' saillante' : ''}`}
            disabled={t.disponible === false}
            onClick={t.action}
            title={`${t.touche} — ${t.libelle}`}
          >
            <kbd>{t.touche}</kbd>
            {t.libelle}
          </button>
        ))
      )}
    </div>
  )
}

/**
 * Barre d'état.
 *
 * L'état de la caisse et l'identité de l'opérateur ne quittent jamais l'écran :
 * ce sont les deux informations qu'un responsable veut pouvoir vérifier d'un
 * coup d'œil, sans naviguer.
 */
export function BarreEtat({ caisse, horloge }: { caisse: EtatCaisse | null; horloge: string }) {
  const session = useSession()
  const ouverte = !!caisse?.session

  return (
    <div className="barre-etat">
      <div className="etat-bloc">
        <span className={`etat-pastille ${ouverte ? 'ouverte' : 'fermee'}`} />
        {ouverte ? (
          <>
            Caisse <strong>{caisse!.session!.reference}</strong> ouverte à{' '}
            <strong>{heure(caisse!.session!.ouverte_at)}</strong>
          </>
        ) : (
          'Caisse fermée'
        )}
      </div>

      {ouverte ? (
        <div className="etat-bloc">
          En caisse <strong>{montant(caisse!.theoriqueEspeces)}</strong>
        </div>
      ) : null}

      {ouverte ? (
        <div className="etat-bloc">
          <strong>{caisse!.nbVentes}</strong> vente{caisse!.nbVentes > 1 ? 's' : ''} ·{' '}
          <strong>{montant(caisse!.totalVentes)}</strong>
        </div>
      ) : null}

      <div className="etat-bloc a-droite">
        {session.utilisateur.role} · <strong>{session.utilisateur.nom_complet}</strong>
      </div>
      <div className="etat-bloc">
        <strong>{horloge}</strong>
      </div>
    </div>
  )
}
