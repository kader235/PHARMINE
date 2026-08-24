import { appeler } from './api'

/**
 * Construit un CSV lisible par Excel en français : séparateur point-virgule,
 * décimales à la virgule. Le point-virgule est indispensable ici — avec une
 * virgule, Excel en français place toute la ligne dans une seule colonne.
 */
export function versCSV(colonnes: string[], lignes: (string | number | null)[][]): string {
  const cellule = (valeur: string | number | null): string => {
    if (valeur === null || valeur === undefined) return ''
    const texte = typeof valeur === 'number' ? String(valeur).replace('.', ',') : valeur
    return /[";\n]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte
  }

  return [colonnes.map(cellule).join(';'), ...lignes.map((l) => l.map(cellule).join(';'))].join('\r\n')
}

/**
 * Propose l'enregistrement d'un fichier. C'est le processus principal qui
 * ouvre la boîte de dialogue et écrit sur le disque : l'interface n'a aucun
 * accès au système de fichiers.
 */
export async function enregistrerCSV(
  nomFichier: string,
  colonnes: string[],
  lignes: (string | number | null)[][]
): Promise<string | null> {
  const resultat = await appeler<{ fichier: string } | null>('exports.enregistrer', {
    nomFichier: nomFichier.endsWith('.csv') ? nomFichier : `${nomFichier}.csv`,
    contenu: versCSV(colonnes, lignes)
  })
  return resultat?.fichier ?? null
}
