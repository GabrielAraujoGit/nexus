<div align="center">

# NEXUS

**Um terminal sci-fi para Linux, com painéis de sistema ao vivo em volta do seu shell.**

Inspirado no visual de filmes e no [eDEX-UI](https://github.com/GitSquared/edex-ui) (arquivado em 2021),
reescrito do zero com dependências atuais e foco em segurança.

![Electron](https://img.shields.io/badge/Electron-45-47848F?logo=electron&logoColor=white)
![xterm.js](https://img.shields.io/badge/xterm.js-6-0A0A0A)
![Linux](https://img.shields.io/badge/plataforma-Linux-FCC624?logo=linux&logoColor=black)
![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-green)
![Status](https://img.shields.io/badge/status-alpha-orange)

</div>

![NEXUS no tema Tron](docs/screenshots/nexus-tron.png)

<table>
  <tr>
    <td><img src="docs/screenshots/nexus-cyberpunk.png" alt="NEXUS no tema Cyberpunk"></td>
    <td><img src="docs/screenshots/nexus-ambar.png" alt="NEXUS no tema Âmbar"></td>
  </tr>
  <tr>
    <td align="center"><b>Cyberpunk</b></td>
    <td align="center"><b>Âmbar</b></td>
  </tr>
</table>

## O que tem

- **Terminal de verdade**: seu shell (`$SHELL`) via `node-pty` + [xterm.js](https://xtermjs.org/), com WebGL,
  cores 24 bits e Nerd Fonts. Seu prompt (Starship, Oh My Bash etc.) funciona igual.
- **Sistema**: relógio, uptime, energia, CPU por grupo de núcleos, temperatura, carga, tarefas,
  memória em grade de pontos e swap.
- **Processos**: os 6 que mais usam CPU, atualizados a cada 3 s.
- **Rede**: estado, IPv4, ping do gateway, tráfego de download/upload e totais.
- **Globo**: wireframe girando com nós e conexões (decorativo).
- **Arquivos**: mostra a pasta onde o shell está (segue o `cd` sozinho). Clique numa pasta para entrar;
  num arquivo, o nome é colado no prompt.
- **Teclado na tela (ABNT2)**: acende com o teclado físico e também digita no clique.
- **3 temas**: Tron, Cyberpunk e Âmbar, trocados pelo botão **TEMA**.

## Instalar

Pré-requisitos: Linux, Node.js 20+ e um compilador C/C++ para o `node-pty`.

```bash
# Ubuntu/Debian
sudo apt install -y build-essential

git clone https://github.com/GabrielAraujoGit/nexus.git
cd nexus
npm install
npm run setup-pty    # compila o node-pty para o Electron
npm start
```

Para ver os ícones do prompt, instale uma [Nerd Font](https://www.nerdfonts.com/)
(o NEXUS procura `MesloLGS NF` e depois `JetBrains Mono`).

## Atalhos

| Tecla | Ação |
|---|---|
| `F11` | Tela cheia |
| `Ctrl+Shift+C` / `Ctrl+Shift+V` | Copiar / colar |
| `Ctrl+Shift+F12` | DevTools |
| `exit` ou `Alt+F4` | Fechar |

## Segurança e privacidade

- A interface roda com `sandbox`, `contextIsolation` e sem `nodeIntegration`; só fala com o processo
  principal por uma ponte IPC mínima (`src/preload.js`).
- A CSP bloqueia scripts e conexões externas, e a janela não navega para fora do app.
- **Nenhuma chamada para a internet**: o ping vai só até o gateway da rede local e o globo não geolocaliza nada.

## Como funciona

```
src/
├── main.js          janela, shell (node-pty), métricas (systeminformation),
│                    pasta atual do shell via /proc/<pid>/cwd
├── preload.js       ponte IPC exposta como window.nexus
└── renderer/
    ├── index.html   layout dos painéis
    ├── style.css    temas (variáveis CSS) e grade
    ├── app.js       liga terminal, painéis e dados
    ├── graphs.js    gráficos de linha em canvas
    ├── globe.js     globo wireframe
    └── keyboard.js  teclado ABNT2 na tela
```

## Capturas de tela

As imagens acima são geradas por `npm run screenshots`, que roda o app em **modo demo**:
usuário, máquina, IP, processos e pasta pessoal são fictícios, então dá para regerar sem expor nada seu.

## Próximos passos

- [ ] Abas e divisão do terminal
- [ ] Temas configuráveis por arquivo
- [ ] Outros layouts de teclado (US, ISO)
- [ ] Sons de interface (opcionais)
- [ ] Painel de git (branch e mudanças da pasta atual)
- [ ] Pacotes `.deb` e AppImage

## Contribuir

Contribuições são bem-vindas! Veja o [CONTRIBUTING.md](CONTRIBUTING.md).

## Licença

[MIT](LICENSE)
