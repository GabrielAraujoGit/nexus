<div align="center">

# NEXUS

**Um terminal sci-fi para Linux, com painéis de sistema ao vivo em volta do seu shell.**

Inspirado no visual de filmes e no [eDEX-UI](https://github.com/GitSquared/edex-ui) (arquivado em 2021),
reescrito do zero com dependências atuais e foco em segurança.

![repo](https://img.shields.io/badge/Repository-nexus-black?style=for-the-badge&logo=github)
![language](https://img.shields.io/badge/Language-JavaScript-blue?style=for-the-badge&logo=javascript&logoColor=white)
![electron](https://img.shields.io/badge/Electron-45-47848F?style=for-the-badge&logo=electron&logoColor=white)
![platform](https://img.shields.io/badge/Platform-Linux-black?style=for-the-badge&logo=linux&logoColor=white)
![status](https://img.shields.io/badge/Status-Alpha-orange?style=for-the-badge)
![license](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

**[English](README.md) · Português (Brasil)**

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
- **CPU**: gráfico de área de 60 s, barra por núcleo, médias de 1/5/15 min, frequência e temperatura
  (amarelo ≥ 70 °C, vermelho ≥ 85 °C).
- **Memória, armazenamento e GPU**: % de uso, usada/disponível/total e swap; cada disco real com usado/total;
  modelo e VRAM da GPU (uso e temperatura nos drivers que informam isso sem root, como NVIDIA).
- **Processos**: os 6 que mais usam CPU e o total de tarefas, atualizados a cada 3 s.
- **Rede**: conexão (velocidade da Ethernet ou nome do Wi-Fi), interface, IPv4 e IPv6 completos, gateway, DNS,
  latência e perda de pacotes até o gateway, e gráfico de 90 s de download/upload com picos e totais.
- **Globo**: wireframe girando com nós e conexões (decorativo).
- **Arquivos**: mostra a pasta onde o shell está (segue o `cd` sozinho). Clique numa pasta para entrar;
  num arquivo, o nome é colado no prompt.
- **Teclado na tela (ABNT2)**: acende com o teclado físico e também digita no clique.
- **Mini navegador**: botão **WEB** abre uma janela flutuante (arraste pela barra, redimensione pelo canto)
  com endereço ou busca (DuckDuckGo), voltar, avançar e recarregar. Só http/https.
- **3 temas**: Tron, Cyberpunk e Âmbar, trocados pelo botão **TEMA**.
- **Sons e animações**: clique de tecla ao digitar, som de inicialização, varredura quando os painéis aparecem,
  falha de sinal ao trocar de tema, arquivos entrando em sequência depois de um `cd` e o mini navegador ligando como
  um monitor CRT. Os painéis pulsam em vermelho com CPU ≥ 90%, temperatura ≥ 85 °C ou memória ≥ 90%. Os sons são
  sintetizados na hora (sem arquivos de áudio) e o botão **SOM** desliga; as animações respeitam a opção
  *reduzir movimento* do sistema.

## Instalar

### Baixar (x86_64)

Pegue a versão mais recente em [Releases](https://github.com/GabrielAraujoGit/nexus/releases/latest):

```bash
# Debian/Ubuntu: instala o comando "nexus" e o atalho no menu
sudo apt install ./nexus-0.1.0-amd64.deb

# Qualquer distro: AppImage (precisa do FUSE 2; no Ubuntu: sudo apt install libfuse2t64)
chmod +x nexus-0.1.0-x86_64.AppImage
./nexus-0.1.0-x86_64.AppImage
```

Os checksums estão em `SHA256SUMS` (`sha256sum -c SHA256SUMS`).

No Ubuntu 24.04+, prefira o `.deb`: ele instala o perfil AppArmor que o sandbox precisa, enquanto o AppImage
pode ser bloqueado pela mesma restrição descrita abaixo.

### Pelo código-fonte

Pré-requisitos: Linux, Node.js 20+ e um compilador C/C++ para o `node-pty`.

```bash
# Ubuntu/Debian
sudo apt install -y build-essential

git clone https://github.com/GabrielAraujoGit/nexus.git
cd nexus
npm install
npm run setup-pty    # compila o node-pty para o Electron
npm start

npm run dist          # opcional: gera o AppImage e o .deb em dist/
```

No **Ubuntu 24.04+**, o `npm start` pode abortar com *"The SUID sandbox helper binary was found, but is not
configured correctly"*. O Ubuntu restringe os user namespaces que o sandbox do Chromium usa. Em vez de desligar o
sandbox, libere só o Electron deste projeto com um perfil AppArmor:

```bash
sudo bash scripts/apparmor-dev.sh          # para desfazer: sudo bash scripts/apparmor-dev.sh remove
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
- **Nenhuma chamada para a internet por conta própria**: o ping vai só até o gateway da rede local e o globo não
  geolocaliza nada. A rede só é usada quando você abre uma página no mini navegador.
- O mini navegador é uma view separada: sandbox, sem acesso ao Node nem à ponte do app, sessão só em memória
  (cookies somem ao fechar), permissões (câmera, microfone, localização, notificações) e downloads negados,
  e só aceita http/https.

## Como funciona

```
src/
├── main.js          janela, shell (node-pty), métricas (systeminformation),
│                    pasta atual do shell via /proc/<pid>/cwd
├── web.js           mini navegador (WebContentsView isolada)
├── preload.js       ponte IPC exposta como window.nexus
└── renderer/
    ├── index.html   layout dos painéis
    ├── style.css    temas (variáveis CSS) e grade
    ├── app.js       liga terminal, painéis e dados
    ├── graphs.js    gráficos de linha em canvas
    ├── globe.js     globo wireframe
    ├── keyboard.js  teclado ABNT2 na tela
    ├── sound.js     sons de interface sintetizados (Web Audio)
    └── web.js       janela flutuante do mini navegador
```

## Capturas de tela

As imagens acima são geradas por `npm run screenshots`, que roda o app em **modo demo**:
usuário, máquina, IP, processos e pasta pessoal são fictícios, então dá para regerar sem expor nada seu.

## Próximos passos

- [ ] Abas e divisão do terminal
- [ ] Temas configuráveis por arquivo
- [ ] Outros layouts de teclado (US, ISO)
- [x] Sons e animações de interface
- [ ] Painel de git (branch e mudanças da pasta atual)
- [ ] Interface em inglês
- [x] Pacotes `.deb` e AppImage

## Contribuir

Contribuições são bem-vindas! Veja o [CONTRIBUTING.pt-BR.md](CONTRIBUTING.pt-BR.md).

## Licença

[MIT](LICENSE)
