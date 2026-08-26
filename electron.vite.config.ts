import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = resolve(__dirname, 'src/shared')

/**
 * Version du logiciel, figée à la compilation.
 *
 * `app.getVersion()` renvoie la version d'Electron tant que l'application
 * n'est pas empaquetée : l'écran de connexion annonçait « Version 43.4.1 ».
 * C'est le numéro qu'on demande au téléphone en assistance — il doit être
 * juste partout, y compris en développement.
 */
const VERSION = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: { __VERSION_PHARMINA__: JSON.stringify(VERSION) },
    resolve: {
      alias: { '@shared': shared, '@main': resolve(__dirname, 'src/main') }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          // Entrées de test : exclues de la distribution par `PHARMINA_SANS_TESTS`.
          // Le scénario de bout en bout est compilé par la même chaîne que
          // l'application : il exerce exactement le code qui sera livré.
          ...(process.env.PHARMINA_SANS_TESTS
            ? {}
            : {
                e2e: resolve(__dirname, 'tests/e2e.ts'),
                apercu: resolve(__dirname, 'tests/apercu.ts'),
                // Outil de démonstration : utile au vendeur, inutile dans le
                // logiciel livré au client.
                demonstration: resolve(__dirname, 'scripts/demonstration.ts')
              })
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    resolve: {
      alias: { '@': resolve(__dirname, 'src/renderer/src'), '@shared': shared }
    },
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } }
    }
  }
})
