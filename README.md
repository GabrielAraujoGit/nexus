# NEXUS

Terminal sci-fi inspirado no eDEX-UI, feito com Electron + xterm.js + node-pty.

## Rodar

```bash
npm install
npm run setup-pty   # precisa de: sudo apt install -y build-essential
npm start           # ou: nexus
```

## Atalhos

- **F11**: tela cheia
- **Ctrl+Shift+C / Ctrl+Shift+V**: copiar / colar
- **Ctrl+Shift+F12**: DevTools
- Botão **TEMA** (canto inferior): tron → cyberpunk → âmbar
- Clique numa pasta no painel de arquivos para entrar nela; num arquivo, cola o nome no prompt.

## Estrutura

- `src/main.js`: janela, shell (pty), métricas (`systeminformation`), pasta atual via `/proc/<pid>/cwd`
- `src/preload.js`: ponte IPC mínima (renderer com `sandbox` e `contextIsolation`)
- `src/renderer/`: interface (`app.js`, `graphs.js`, `globe.js`, `keyboard.js`, `style.css`)

O ping é feito só no gateway da rede local; o app não faz nenhuma chamada para a internet.
