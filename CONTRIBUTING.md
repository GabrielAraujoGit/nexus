# Contribuindo com o NEXUS

Valeu pelo interesse! Algumas combinações para manter o projeto simples e seguro.

## Rodando localmente

```bash
npm install
npm run setup-pty
npm start
```

`Ctrl+Shift+F12` abre o DevTools da interface.

## Antes de abrir um PR

- **Uma mudança por PR**, com descrição do que muda e por quê. Mudança visual: inclua captura de tela.
- Commits no formato [Conventional Commits](https://www.conventionalcommits.org/pt-br/)
  (`feat: …`, `fix: …`, `docs: …`).
- Sem bundler nem framework na interface: JavaScript puro em `src/renderer/`.
- Dependência nova só se fizer falta de verdade, com versão exata (`npm install --save-exact`).
- Rode `node --check` nos arquivos que mexeu e teste o app abrindo de verdade.

## Regras de segurança

- A interface continua com `sandbox`, `contextIsolation` e sem `nodeIntegration`.
- Nada de `innerHTML` com dado externo (nome de arquivo, saída de comando, processo): use `textContent`.
- O app não faz chamadas para a internet por conta própria. Se uma feature precisar, ela deve ser opcional e
  só agir quando o usuário pedir (como o mini navegador).
- A página do mini navegador nunca ganha preload, Node ou acesso à ponte `window.nexus`.
- Novos canais IPC validam o que recebem no `main.js`.

## Capturas de tela

Mudou o visual? Regere as imagens do README com:

```bash
npm run screenshots
```

Elas usam o modo demo, com dados fictícios. Nunca suba capturas com seu usuário, IP ou arquivos.
