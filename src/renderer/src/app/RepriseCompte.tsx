/**
 * Rouvrir un compte avec son code de secours.
 *
 * Cette fenêtre s'ouvre depuis l'écran de connexion, quand le mot de passe est
 * perdu. C'est le seul endroit du logiciel accessible sans être connecté —
 * forcément, puisqu'il sert précisément quand personne ne peut l'être.
 *
 * Elle demande trois choses et rien d'autre : qui vous êtes, le code du
 * coffre, et le mot de passe que vous voulez désormais. Le service refuse de la
 * même façon si l'identifiant est inconnu ou si le code est faux — sinon, on
 * apprendrait quels comptes existent en essayant des noms au hasard — et il
 * bloque un quart d'heure au bout de cinq essais.
 *
 * Un code neuf est délivré dans la foulée, et affiché ici : l'officine ne doit
 * pas repartir sans filet.
 */
import { useState, type FormEvent } from 'react'
import { appeler, messageErreur, type ErreurAffichable } from '../lib/api'
import { Bandeau, Bouton, Champ, Modale } from '../ui/Composants'
import { PanneauCodeSecours } from './CodeSecours'

export default function RepriseCompte({ onFermer }: { onFermer: () => void }) {
  const [identifiant, setIdentifiant] = useState('')
  const [code, setCode] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [erreur, setErreur] = useState<ErreurAffichable | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [resultat, setResultat] = useState<{ nomComplet: string; codeSuivant: string } | null>(null)

  const motDePasseValide =
    motDePasse.length >= 8 && /[A-Za-z]/.test(motDePasse) && /[0-9]/.test(motDePasse)
  const valide =
    identifiant.trim().length >= 2 &&
    code.trim().length >= 8 &&
    motDePasseValide &&
    motDePasse === confirmation

  async function soumettre(evenement: FormEvent): Promise<void> {
    evenement.preventDefault()
    setEnCours(true)
    setErreur(null)
    try {
      const reponse = (await appeler('secours.rouvrir', {
        identifiant: identifiant.trim(),
        code: code.trim(),
        nouveauMotDePasse: motDePasse
      })) as { nomComplet: string; codeSuivant: string }
      setResultat(reponse)
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  if (resultat) {
    return (
      <Modale titre="Compte rouvert" large onFermer={onFermer}>
        <div className="modale-formulaire">
          <Bandeau
            ton="succes"
            titre={`${resultat.nomComplet} peut se connecter avec son nouveau mot de passe.`}
          />
          <PanneauCodeSecours
            code={resultat.codeSuivant}
            pied={(range) => (
              <Bouton variante="principal" pleine disabled={!range} onClick={onFermer}>
                Revenir à la connexion
              </Bouton>
            )}
          />
        </div>
      </Modale>
    )
  }

  return (
    <Modale
      titre="Mot de passe perdu"
      description="Munissez-vous du code de secours imprimé à l’installation."
      onFermer={onFermer}
      pied={
        <>
          <Bouton variante="discret" onClick={onFermer}>
            Annuler
          </Bouton>
          <Bouton
            variante="principal"
            disabled={!valide}
            enCours={enCours}
            onClick={(e) => void soumettre(e)}
          >
            Rouvrir le compte
          </Bouton>
        </>
      }
    >
      <form onSubmit={soumettre} className="modale-formulaire">
        {erreur ? <Bandeau ton="danger" titre={erreur.message} /> : null}

        <Champ
          libelle="Identifiant"
          value={identifiant}
          onChange={(e) => setIdentifiant(e.target.value)}
          autoFocus
          required
        />
        <Champ
          libelle="Code de secours"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          aide="Recopiez-le tel qu’il est écrit. Les tirets, les espaces et les minuscules n’ont pas d’importance."
          required
        />
        <div className="grille deux">
          <Champ
            libelle="Nouveau mot de passe"
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            aide="8 caractères minimum, avec au moins une lettre et un chiffre."
            erreur={
              motDePasse && !motDePasseValide
                ? 'Il manque une lettre, un chiffre, ou la longueur minimale.'
                : undefined
            }
            required
          />
          <Champ
            libelle="Confirmation"
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            erreur={
              confirmation && motDePasse !== confirmation ? 'Les deux mots de passe diffèrent.' : undefined
            }
            required
          />
        </div>

        {/* Un bouton d'envoi invisible : sans lui, la touche Entrée ne
            validerait pas le formulaire, puisque le vrai bouton est dans le
            pied de la fenêtre. */}
        <button type="submit" hidden disabled={!valide} />
      </form>
    </Modale>
  )
}
