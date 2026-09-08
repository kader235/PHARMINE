/**
 * Publier une version, d'un seul geste.
 *
 *     npm run publier -- 0.1.4
 *
 * CE QUE CETTE COMMANDE FAIT
 *
 *   1. elle vérifie TOUT — compilation, 362 vérifications métier, invariants
 *      de schéma, référentiel, signature des licences ;
 *   2. elle exige que NOUVEAUTES.md décrive la version, en français, pour un
 *      pharmacien ;
 *   3. elle monte le numéro, régénère le guide, commite, étiquette et pousse ;
 *   4. GitHub construit les deux installateurs et publie.
 *
 * Les postes en formule Premium voient la version le lendemain au plus tard,
 * et l'installent depuis le logiciel. Les postes Standard la voient annoncée
 * et passent par leur fournisseur.
 *
 * POURQUOI TANT DE GARDES AVANT DE POUSSER
 *
 * Une étiquette poussée déclenche une publication publique. On ne la rattrape
 * pas : un client peut l'avoir téléchargée avant qu'on s'aperçoive du
 * problème. Chaque contrôle coûte ici une minute, et là-bas une officine.
 *
 * La commande s'arrête au PREMIER échec, et dit lequel. Elle ne pousse rien
 * tant que tout n'est pas vert.
 */
const { execFileSync, execSync } = require('node:child_process')
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')

const RACINE = join(__dirname, '..')

function titre(texte) {
  console.log(`\n\x1b[1m${texte}\x1b[0m`)
}

function echouer(quoi, quoiFaire) {
  console.error(`\n\x1b[31m  ARRÊT — ${quoi}\x1b[0m`)
  if (quoiFaire) console.error(`  ${quoiFaire}\n`)
  process.exit(1)
}

function courir(commande, options = {}) {
  return execSync(commande, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe', ...options })
}

/** Exécute une épreuve et exige un motif dans sa sortie. */
function eprouver(libelle, commande, motif) {
  process.stdout.write(`  ${libelle}… `)
  let sortie = ''
  try {
    sortie = courir(commande)
  } catch (erreur) {
    sortie = `${erreur.stdout ?? ''}${erreur.stderr ?? ''}`
    console.log('\x1b[31mÉCHEC\x1b[0m')
    console.error(sortie.split('\n').slice(-25).join('\n'))
    echouer(`${libelle} n’est pas passé`, 'Corrigez avant de publier.')
  }
  if (motif && !motif.test(sortie)) {
    console.log('\x1b[31mÉCHEC\x1b[0m')
    console.error(sortie.split('\n').slice(-25).join('\n'))
    echouer(`${libelle} n’a pas donné le résultat attendu`)
  }
  const chiffres = sortie.match(/(\d+) v[ée]rifications? r[ée]ussies?/i)
  console.log(`\x1b[32mOK\x1b[0m${chiffres ? ` — ${chiffres[1]} vérifications` : ''}`)
  return sortie
}

function main() {
  const version = process.argv[2]
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error('\nIndiquez le numéro de la version :\n')
    console.error('  npm run publier -- 0.1.4\n')
    process.exit(1)
  }

  const actuelle = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8')).version
  console.log(`\nPHARMINA ${actuelle} → \x1b[1m${version}\x1b[0m`)

  // --- 1. L'état du dépôt ---------------------------------------------------
  titre('1 · Le dépôt')

  const branche = courir('git rev-parse --abbrev-ref HEAD').trim()
  if (branche !== 'master') {
    echouer(`vous êtes sur la branche « ${branche} »`, 'Publiez depuis master.')
  }
  console.log('  branche master — OK')

  const enAttente = courir('git status --porcelain').trim()
  if (enAttente) {
    console.error('\n  Fichiers non commités :')
    for (const ligne of enAttente.split('\n').slice(0, 12)) console.error(`    ${ligne}`)
    echouer(
      'le dépôt n’est pas propre',
      'Commitez ou remisez avant de publier : ce qui n’est pas commité ne partira pas.'
    )
  }
  console.log('  aucun changement en attente — OK')

  const dejaPubliee = courir('git tag --list').split('\n').includes(`v${version}`)
  if (dejaPubliee) {
    echouer(
      `la version ${version} a déjà été publiée`,
      'Choisissez un numéro plus élevé : une version publiée ne se remplace pas.'
    )
  }
  console.log(`  l’étiquette v${version} est libre — OK`)

  // --- 2. Les notes destinées au pharmacien --------------------------------
  titre('2 · Les nouveautés, écrites pour le pharmacien')

  const nouveautes = readFileSync(join(RACINE, 'NOUVEAUTES.md'), 'utf8')
  const section = nouveautes.split(/^## /m).slice(1).find((s) => s.split('\n')[0].trim() === version)
  if (!section) {
    echouer(
      `NOUVEAUTES.md ne décrit pas la version ${version}`,
      `Ajoutez une section « ## ${version} » disant ce qui change POUR LUI, en dix lignes au plus.`
    )
  }
  // Le script des notes applique les mêmes règles que le logiciel : une note
  // qui ne s'afficherait pas ne doit pas être publiée.
  const apercu = courir(`node scripts/notes-version.js`, {
    env: { ...process.env, npm_package_version: version }
  })
  console.log('  section trouvée et présentable — OK')
  for (const ligne of apercu.split('\n').filter((l) => l.trim().startsWith('•'))) {
    console.log(`\x1b[2m  ${ligne.trim()}\x1b[0m`)
  }

  // --- 3. Les épreuves ------------------------------------------------------
  titre('3 · Les vérifications')

  eprouver('compilation', 'npm run typecheck')
  eprouver('construction', 'npx electron-vite build')
  eprouver('vérifications métier', 'npx electron out/main/e2e.js', /0 echec/)
  eprouver('invariants de schéma', 'npx electron tests/schema.test.js', /0 echouees/)
  eprouver('référentiel et permissions', 'npx electron tests/seed.test.js', /toutes les v/i)
  eprouver('signature des licences', 'node scripts/ed25519.test.js', /0 echouees/)

  // --- 4. Le guide ----------------------------------------------------------
  titre('4 · Le guide d’utilisation')

  courir('npx electron out/main/manuel.js', {
    env: Object.fromEntries(
      Object.entries(process.env).filter(([c]) => c !== 'ELECTRON_RUN_AS_NODE')
    )
  })
  const pdf = join(RACINE, 'Manuel-PHARMINA.pdf')
  if (!existsSync(pdf)) echouer('le guide n’a pas été produit')
  console.log(`  Manuel-PHARMINA.pdf régénéré — OK`)

  // --- 5. La publication ----------------------------------------------------
  titre('5 · La publication')

  execFileSync('npm', ['version', version, '--no-git-tag-version'], { cwd: RACINE, stdio: 'pipe', shell: true })
  courir('git add -A')
  execFileSync('git', ['commit', '-q', '-m', `Version ${version}`], { cwd: RACINE, stdio: 'pipe' })
  execFileSync('git', ['tag', `v${version}`], { cwd: RACINE, stdio: 'pipe' })
  console.log(`  version ${version} commitée et étiquetée`)

  try {
    courir('git push origin master --tags')
  } catch (erreur) {
    echouer(
      'la poussée a échoué',
      'La version est commitée et étiquetée localement. Relancez « git push origin master --tags » quand la ligne revient.'
    )
  }

  console.log('\n\x1b[32m  Publiée.\x1b[0m')
  console.log('')
  console.log('  GitHub construit les deux installateurs et les publie dans Releases.')
  console.log('  Suivez : https://github.com/kader235/PHARMINE/actions')
  console.log('')
  console.log('  Les postes en formule Premium la verront dans les vingt-quatre heures')
  console.log('  et l’installeront depuis le logiciel. Les postes Standard la verront')
  console.log('  annoncée, et passeront par vous.')
  console.log('')
}

main()
