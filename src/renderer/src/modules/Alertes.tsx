import { useState } from 'react'
import type { Alerte, PrioriteAlerte } from '@shared/types'
import { useAction, useRequete } from '../lib/hooks'
import { useSession } from '../app/Session'
import { useFonctions } from '../app/fonctions'
import { useNavigation, type CleModule } from '../app/navigation'
import { useNotifications } from '../ui/Notifications'
import Icone, { type NomIcone } from '../ui/Icone'
import { Bouton, Chargement, EntetePage, ErreurEcran, EtatVide, Indicateur, Panneau, Segments } from '../ui/Composants'
import { depuis } from '../lib/format'

const ICONES: Record<string, NomIcone> = {
  rupture: 'boite-vide',
  stock_faible: 'stock',
  peremption_proche: 'horloge',
  produit_expire: 'peremption',
  caisse_non_cloturee: 'caisse',
  ecart_caisse: 'caisse',
  dette_fournisseur: 'fournisseur',
  creance_client: 'client',
  inventaire_en_cours: 'inventaire',
  sauvegarde: 'sauvegarde'
}

/** Où mène chaque type d'alerte. Une alerte non actionnable n'a pas d'intérêt. */
const DESTINATIONS: Record<string, { module: CleModule; filtre?: string; libelle: string }> = {
  rupture: { module: 'stock', filtre: 'rupture', libelle: 'Voir le stock' },
  stock_faible: { module: 'stock', filtre: 'faible', libelle: 'Voir le stock' },
  peremption_proche: { module: 'peremptions', libelle: 'Voir les péremptions' },
  produit_expire: { module: 'peremptions', filtre: 'expire', libelle: 'Retirer du rayon' },
  caisse_non_cloturee: { module: 'caisse', libelle: 'Clôturer la caisse' },
  ecart_caisse: { module: 'caisse', libelle: 'Voir la caisse' },
  dette_fournisseur: { module: 'fournisseurs', libelle: 'Voir le fournisseur' },
  creance_client: { module: 'clients', libelle: 'Voir le client' },
  inventaire_en_cours: { module: 'inventaire', libelle: 'Reprendre l’inventaire' },
  sauvegarde: { module: 'parametres', libelle: 'Sauvegarder' }
}

const LIBELLES_PRIORITE: Record<PrioriteAlerte, string> = {
  urgent: 'Urgent',
  important: 'Important',
  information: 'Information'
}

export default function Alertes() {
  const session = useSession()
  const naviguer = useNavigation()
  const notifications = useNotifications()
  const action = useAction()
  const [filtre, setFiltre] = useState<PrioriteAlerte | 'toutes'>('toutes')

  const alertes = useRequete<Alerte[]>('alertes.lister')

  useFonctions('alertes', [
    { touche: 'F5', libelle: 'Recalculer', action: rafraichir },
    {
      touche: 'F7',
      libelle: 'Urgent seulement',
      action: () => setFiltre((f) => (f === 'urgent' ? 'toutes' : 'urgent'))
    },
    {
      touche: 'F9',
      libelle: 'Tout marquer comme lu',
      action: toutMarquer,
      disponible: session.peut('alertes.traiter')
    }
  ])

  const liste = (alertes.donnees ?? []).filter((a) => filtre === 'toutes' || a.priorite === filtre)
  const compte = (p: PrioriteAlerte) => (alertes.donnees ?? []).filter((a) => a.priorite === p).length

  async function rafraichir(): Promise<void> {
    await action.executer('alertes.rafraichir')
    alertes.recharger()
  }

  async function toutMarquer(): Promise<void> {
    const cles = liste.filter((a) => !a.lue_at).map((a) => a.cle)
    if (!cles.length) return
    const r = await action.executer('alertes.marquerLues', { cles })
    if (r !== null) {
      alertes.recharger()
      notifications.succes(`${cles.length} alerte(s) marquée(s) comme lue(s)`)
    }
  }

  if (alertes.erreur) return <ErreurEcran erreur={alertes.erreur} onReessayer={alertes.recharger} />

  return (
    <>
      <EntetePage
        titre="Alertes"
        actions={
          <>
            <Bouton icone="fleche-droite" enCours={action.enCours} onClick={rafraichir}>
              Recalculer
            </Bouton>
            {session.peut('alertes.traiter') && liste.some((a) => !a.lue_at) ? (
              <Bouton icone="coche" onClick={toutMarquer}>
                Tout marquer comme lu
              </Bouton>
            ) : null}
          </>
        }
      />

      <div className="indicateurs">
        <Indicateur
          libelle="Urgent"
          valeur={String(compte('urgent'))}
          ton={compte('urgent') > 0 ? 'danger' : undefined}
          detail={<span>Action requise aujourd’hui</span>}
        />
        <Indicateur
          libelle="Important"
          valeur={String(compte('important'))}
          detail={<span>À traiter cette semaine</span>}
        />
        <Indicateur
          libelle="Information"
          valeur={String(compte('information'))}
          detail={<span>Pour votre suivi</span>}
        />
      </div>

      <Panneau
        titre="Alertes en cours"
        description="Une alerte disparaît d’elle-même dès que la situation est résolue."
        actions={
          <Segments
            valeur={filtre}
            options={[
              { valeur: 'toutes', libelle: 'Toutes' },
              { valeur: 'urgent', libelle: 'Urgent' },
              { valeur: 'important', libelle: 'Important' },
              { valeur: 'information', libelle: 'Information' }
            ]}
            onChange={setFiltre}
          />
        }
        sansCorps
      >
        {alertes.chargement && !alertes.donnees ? (
          <Chargement />
        ) : liste.length === 0 ? (
          <EtatVide icone="coche" titre={filtre === 'toutes' ? 'Aucune alerte en cours' : 'Aucune alerte de ce niveau'}>
            {filtre === 'toutes'
              ? 'Aucune rupture, aucun lot périmé, aucune caisse oubliée. Tout est en ordre.'
              : 'Changez de filtre pour voir les autres alertes.'}
          </EtatVide>
        ) : (
          <div>
            {liste.map((a) => {
              const destination = DESTINATIONS[a.type]
              return (
                <button
                  key={a.cle}
                  className="alerte-ligne"
                  onClick={() =>
                    destination
                      ? naviguer({
                          module: destination.module,
                          filtre: destination.filtre,
                          cible:
                            a.entite && a.entite_id
                              ? { type: a.entite as never, id: a.entite_id }
                              : undefined
                        })
                      : undefined
                  }
                >
                  <span className={`alerte-marque ${a.priorite}`}>
                    <Icone nom={ICONES[a.type] ?? 'alerte'} taille={14} />
                  </span>
                  <span className="alerte-texte">
                    <strong>
                      {a.titre}
                      {!a.lue_at ? (
                        <span
                          style={{
                            display: 'inline-block',
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: 'var(--accent)',
                            marginLeft: 6,
                            verticalAlign: 'middle'
                          }}
                        />
                      ) : null}
                    </strong>
                    <span>{a.message}</span>
                  </span>
                  <span style={{ color: 'var(--texte-faible)', fontSize: 11.5, whiteSpace: 'nowrap' }}>
                    {LIBELLES_PRIORITE[a.priorite]} · {depuis(a.created_at)}
                  </span>
                  {destination ? (
                    <span
                      style={{
                        color: 'var(--accent)',
                        fontSize: 11.5,
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      {destination.libelle}
                      <Icone nom="chevron-droit" taille={12} />
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
      </Panneau>
    </>
  )
}
