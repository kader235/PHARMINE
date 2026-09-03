import { useEffect, useRef, useState } from 'react'
import { Bouton, Champ, ChampMontant, Modale } from '../ui/Composants'
import Icone from '../ui/Icone'
import { appeler, messageErreur } from '../lib/api'
import { useNotifications } from '../ui/Notifications'
import { useLecteurCodeBarres } from '../lib/codeBarres'

/**
 * Enregistrement rapide d'un produit.
 *
 * POURQUOI CET ÉCRAN EXISTE À CÔTÉ DE LA FICHE COMPLÈTE
 *
 * La fiche complète demande une quinzaine de renseignements : catégorie,
 * laboratoire, forme, unité, TVA, seuils, notes. C'est ce qu'il faut pour un
 * catalogue bien tenu, et c'est trop quand une livraison de quarante
 * références attend sur le comptoir.
 *
 * Six champs, dans l'ordre où on les lit sur la boîte : le nom, la quantité,
 * le prix, l'emplacement, le code-barres, la péremption. Le reste se complète
 * plus tard depuis la fiche — ou jamais : un produit sans laboratoire se vend
 * très bien.
 *
 * LE CODE-BARRES
 *
 * Le champ écoute la douchette : on scanne, le code se remplit. Si la boîte
 * n'en porte pas — conditionnement local, étiquette arrachée, générique
 * importé en vrac — le logiciel en fabrique un, valide et scannable, que
 * l'officine imprime et colle. C'est le défaut, parce que c'est le cas le plus
 * fréquent au Tchad.
 */
export function ProduitRapide({
  codeInitial,
  onFerme,
  onCree
}: {
  /** Code déjà lu, quand on arrive depuis un scan resté sans réponse. */
  codeInitial?: string | null
  onFerme: () => void
  onCree?: (resultat: { id: number; codeBarres: string | null; codeEngendre: boolean }) => void
}) {
  const notifications = useNotifications()
  const champNom = useRef<HTMLInputElement>(null)

  const [nom, setNom] = useState('')
  const [quantite, setQuantite] = useState('')
  const [prixVente, setPrixVente] = useState(0)
  const [prixAchat, setPrixAchat] = useState(0)
  const [emplacement, setEmplacement] = useState('')
  const [codeBarres, setCodeBarres] = useState(codeInitial ?? '')
  const [peremption, setPeremption] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreurs, setErreurs] = useState<Record<string, string>>({})

  // Le curseur part sur le nom : c'est le seul champ vraiment obligatoire, et
  // celui qu'on a sous les yeux en prenant la boîte.
  useEffect(() => {
    champNom.current?.focus()
  }, [])

  // La douchette remplit le code sans qu'on ait à cliquer dans le champ : au
  // comptoir comme en réserve, on scanne les mains occupées.
  useLecteurCodeBarres({
    onScan: (code: string) => {
      setCodeBarres(code)
      setErreurs((e) => ({ ...e, codeBarres: '' }))
    }
  })

  async function enregistrer(): Promise<void> {
    const soucis: Record<string, string> = {}
    if (!nom.trim()) soucis.nom = 'Le nom est obligatoire.'
    if (!(prixVente > 0)) soucis.prixVente = 'Le prix de vente est obligatoire.'
    const q = quantite.trim() === '' ? 0 : Number(quantite)
    if (!Number.isInteger(q) || q < 0) soucis.quantite = 'Quantité invalide.'
    if (Object.keys(soucis).length) {
      setErreurs(soucis)
      return
    }

    setEnCours(true)
    setErreurs({})
    try {
      const resultat = await appeler<{
        id: number
        codeInterne: string
        codeBarres: string | null
        codeEngendre: boolean
      }>('produits.creer_rapide', {
        nom: nom.trim(),
        prixVente,
        quantite: q,
        prixAchat: prixAchat > 0 ? prixAchat : undefined,
        emplacement: emplacement.trim() || null,
        codeBarres: codeBarres.trim() || null,
        datePeremption: peremption || null
      })

      notifications.succes(
        resultat.codeEngendre
          ? `${nom.trim()} enregistré. Code-barres fabriqué : ${resultat.codeBarres} — à imprimer et coller.`
          : `${nom.trim()} enregistré.`
      )
      onCree?.(resultat)
      onFerme()
    } catch (erreur) {
      const message = messageErreur(erreur)
      // Le message du serveur nomme le champ fautif quand il le connaît : on
      // le pose là plutôt que dans une notification qui disparaît.
      setErreurs({ general: message.message })
      setEnCours(false)
    }
  }

  return (
    <Modale
      titre="Enregistrement rapide"
      description="Six champs, et la boîte est vendable. Le reste se complète plus tard depuis la fiche."
      onFermer={onFerme}
      pied={
        <>
          <Bouton variante="discret" onClick={onFerme}>
            Annuler
          </Bouton>
          <Bouton variante="principal" icone="plus" onClick={enregistrer} enCours={enCours}>
            Enregistrer
          </Bouton>
        </>
      }
    >
      <div className="rapide-grille">
        <Champ
          ref={champNom}
          libelle="Nom du produit"
          obligatoire
          large
          value={nom}
          erreur={erreurs.nom}
          placeholder="Ibuprofène 400 mg"
          onChange={(e) => setNom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void enregistrer()
          }}
        />

        <Champ
          libelle="Quantité reçue"
          type="number"
          min={0}
          step={1}
          value={quantite}
          erreur={erreurs.quantite}
          aide="Laissez vide si la livraison n’est pas encore arrivée."
          onChange={(e) => setQuantite(e.target.value)}
        />

        <ChampMontant
          libelle="Prix de vente"
          obligatoire
          valeur={prixVente}
          erreur={erreurs.prixVente}
          onChangeValeur={setPrixVente}
        />

        <ChampMontant
          libelle="Prix d’achat"
          valeur={prixAchat}
          aide="Facultatif. Sans lui, la valeur du stock et la marge de ce produit restent à zéro."
          onChangeValeur={setPrixAchat}
        />

        <Champ
          libelle="Emplacement"
          value={emplacement}
          placeholder="Rayon B · Étagère 1"
          aide="Où la boîte se trouve dans l’officine."
          onChange={(e) => setEmplacement(e.target.value)}
        />

        <Champ
          libelle="Code-barres"
          value={codeBarres}
          erreur={erreurs.codeBarres}
          placeholder="Scannez la boîte…"
          inputMode="numeric"
          aide={
            codeBarres.trim()
              ? undefined
              : 'Vide : le logiciel en fabrique un, à imprimer depuis la planche d’étiquettes.'
          }
          onChange={(e) => setCodeBarres(e.target.value)}
        />

        <Champ
          libelle="Date de péremption"
          type="date"
          value={peremption}
          aide="Celle du lot reçu. Sans elle, aucune alerte ne pourra prévenir."
          onChange={(e) => setPeremption(e.target.value)}
        />
      </div>

      {erreurs.general ? (
        <p className="rapide-erreur" role="alert">
          <Icone nom="alerte" taille={15} />
          {erreurs.general}
        </p>
      ) : null}
    </Modale>
  )
}
