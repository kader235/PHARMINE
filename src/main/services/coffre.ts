/**
 * Chiffrement des sauvegardes.
 *
 * Une sauvegarde a une contrainte que la base vivante n'a pas : elle doit
 * pouvoir repartir sur un AUTRE ordinateur. C'est même sa raison d'être — le
 * poste a brûlé, on en installe un neuf, on restaure. La chiffrer avec la clé
 * du poste la rendrait donc inutilisable au moment précis où elle sert.
 *
 * Elle est chiffrée avec la clé du logiciel : toute installation de PHARMINA
 * l'ouvre, personne d'autre. Le pharmacien n'a rien à saisir, rien à noter,
 * rien à perdre — et le fichier posé sur une clé USB oubliée dans un taxi
 * n'est qu'une suite d'octets pour qui le ramasse.
 *
 * AES-256-GCM : le contenu est chiffré ET authentifié. Une sauvegarde
 * modifiée d'un seul octet est refusée au lieu d'être restaurée en silence.
 * Un sel tiré au sort par fichier fait que deux sauvegardes du même contenu
 * ne se ressemblent pas.
 *
 * La limite, énoncée franchement : la clé du logiciel voyage dans le
 * logiciel. Quelqu'un d'assez outillé pour désassembler le programme finira
 * par l'extraire. C'est le prix du « l'utilisateur ne fait rien » ; voir
 * db/cles.ts.
 */
import { createCipheriv, createDecipheriv } from 'node:crypto'
import { closeSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs'
import { TAILLE_SEL, cleDeSauvegarde, nouveauSel } from '../db/cles'
import { ErreurMetier } from './commun'

/** En-tête reconnaissable : un fichier chiffré se distingue d'une base en clair. */
const SIGNATURE = Buffer.from('PHARMINA-COFFRE-2' + String.fromCharCode(10), 'ascii')
const TAILLE_IV = 12
const TAILLE_MARQUE = 16

/** Vrai si le fichier porte la signature d'une sauvegarde chiffrée. */
export function estChiffre(fichier: string): boolean {
  let descripteur: number | null = null
  try {
    descripteur = openSync(fichier, 'r')
    const debut = Buffer.alloc(SIGNATURE.length)
    const lus = readSync(descripteur, debut, 0, SIGNATURE.length, 0)
    return lus === SIGNATURE.length && debut.equals(SIGNATURE)
  } catch {
    return false
  } finally {
    if (descripteur !== null) closeSync(descripteur)
  }
}

export function chiffrerFichier(source: string, destination: string): void {
  const clair = readFileSync(source)
  const sel = nouveauSel()
  const iv = Buffer.from(sel.subarray(0, TAILLE_IV))
  const chiffreur = createCipheriv('aes-256-gcm', cleDeSauvegarde(sel), iv)

  // La signature est authentifiée avec le contenu : modifier l'en-tête pour
  // faire passer un fichier pour un autre invalide le déchiffrement.
  chiffreur.setAAD(SIGNATURE)

  const chiffre = Buffer.concat([chiffreur.update(clair), chiffreur.final()])
  writeFileSync(
    destination,
    Buffer.concat([SIGNATURE, sel, chiffreur.getAuthTag(), chiffre])
  )
}

export function dechiffrerFichier(source: string, destination: string): void {
  const brut = readFileSync(source)
  const entete = SIGNATURE.length

  if (
    brut.length < entete + TAILLE_SEL + TAILLE_MARQUE ||
    !brut.subarray(0, entete).equals(SIGNATURE)
  ) {
    throw new ErreurMetier('Ce fichier n’est pas une sauvegarde PHARMINA chiffrée.', 'fichier')
  }

  const sel = brut.subarray(entete, entete + TAILLE_SEL)
  const iv = sel.subarray(0, TAILLE_IV)
  const marque = brut.subarray(entete + TAILLE_SEL, entete + TAILLE_SEL + TAILLE_MARQUE)
  const chiffre = brut.subarray(entete + TAILLE_SEL + TAILLE_MARQUE)

  const dechiffreur = createDecipheriv('aes-256-gcm', cleDeSauvegarde(sel), iv)
  dechiffreur.setAAD(SIGNATURE)
  dechiffreur.setAuthTag(marque)

  try {
    writeFileSync(destination, Buffer.concat([dechiffreur.update(chiffre), dechiffreur.final()]))
  } catch {
    // GCM refuse aussi bien une mauvaise clé qu'un fichier abîmé : on ne peut
    // pas distinguer les deux, et c'est voulu.
    throw new ErreurMetier(
      'Déchiffrement impossible : ce fichier n’a pas été produit par PHARMINA, ou il a été modifié.',
      'fichier'
    )
  }
}
