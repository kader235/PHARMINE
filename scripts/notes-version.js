/**
 * Extrait de NOUVEAUTES.md la section de la version en cours.
 *
 * POURQUOI
 *
 * Sans ce fichier, electron-builder prend le MESSAGE DE COMMIT comme notes de
 * version. C'est ce qui s'est produit pour la 0.1.2 : un pharmacien de
 * N'Djamena a vu s'afficher « <p> », « <br /> », « 325 verifications metier »
 * et une ligne de co-auteur. Des balises brutes devant un client donnent
 * l'impression d'un logiciel cassé.
 *
 * Le logiciel se défend désormais — il refuse d'afficher ce qui ressemble à un
 * message de commit. Mais refuser, c'est ne rien annoncer. La vraie réponse est
 * d'écrire de vraies notes, et de les publier à la place.
 *
 * CE QUE CE SCRIPT REFUSE DE FAIRE
 *
 * Publier une version dont les notes ne passeraient pas le filtre du logiciel.
 * Il applique les mêmes règles ici, à la construction, où l'erreur coûte une
 * minute — plutôt que de la découvrir sur le comptoir d'un client.
 */
const { existsSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const RACINE = join(__dirname, '..')
const SOURCE = join(RACINE, 'NOUVEAUTES.md')
const SORTIE = join(RACINE, 'notes-de-version.md')

function main() {
  const version = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8')).version

  if (!existsSync(SOURCE)) {
    console.error(`\nNOUVEAUTES.md est introuvable. Sans lui, aucune note ne peut être publiée.\n`)
    process.exit(1)
  }

  const texte = readFileSync(SOURCE, 'utf8')
  const sections = texte.split(/^## /m).slice(1)
  const trouvee = sections.find((s) => s.split('\n')[0].trim() === version)

  if (!trouvee) {
    console.error('')
    console.error(`Aucune section « ## ${version} » dans NOUVEAUTES.md.`)
    console.error('')
    console.error('Écrivez ce que cette version change POUR LE PHARMACIEN, en dix')
    console.error('lignes au plus, avant de publier. Ces lignes s’afficheront sur')
    console.error('son comptoir.')
    console.error('')
    process.exit(1)
  }

  const corps = trouvee.split('\n').slice(1).join('\n').trim()

  // Les mêmes règles que `notesLisibles` dans le logiciel : les faire échouer
  // ici coûte une minute, les découvrir chez un client coûte sa confiance.
  const lignes = corps.split('\n').map((l) => l.trim()).filter(Boolean)
  const soucis = []
  if (!lignes.length) soucis.push('la section est vide')
  if (lignes.length > 10) soucis.push(`${lignes.length} lignes, dix au maximum`)
  const longue = lignes.find((l) => l.length > 200)
  if (longue) soucis.push(`une ligne de ${longue.length} caractères, deux cents au maximum`)
  if (corps.length > 600) soucis.push(`${corps.length} caractères en tout, six cents au maximum`)
  if (/co-authored-by|signed-off-by/i.test(corps)) soucis.push('une signature de dépôt traîne')
  if (corps.includes('<')) soucis.push('un chevron « < » empêcherait l’affichage')

  if (soucis.length) {
    console.error('')
    console.error(`Les notes de la version ${version} ne seraient pas affichées :`)
    for (const souci of soucis) console.error(`  — ${souci}`)
    console.error('')
    console.error('Le logiciel refuse ce qui ressemble à un texte de développeur.')
    console.error('')
    process.exit(1)
  }

  writeFileSync(SORTIE, corps, 'utf8')
  console.log('')
  console.log(`  Notes de la version ${version} — ${lignes.length} ligne(s), ${corps.length} caractères`)
  console.log('')
  for (const ligne of lignes) console.log(`    ${ligne}`)
  console.log('')
}

main()
