/// <reference types="vite/client" />

/**
 * Les fichiers SQL sont intégrés au bundle du processus principal sous forme
 * de chaînes : le schéma voyage avec l'application, sans fichier à déployer
 * à côté de l'exécutable.
 */
declare module '*.sql?raw' {
  const contenu: string
  export default contenu
}
