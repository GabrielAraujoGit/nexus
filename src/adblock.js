'use strict';
// NEXUS — bloqueador de anúncios e rastreadores do mini navegador e do YouTube Music, sem dependências.
// Corta na rede as requisições para domínios conhecidos de anúncio e rastreamento (e seus subdomínios)
// e esconde os espaços de anúncio mais comuns. A página principal nunca é bloqueada: só o que ela carrega.

// Redes de anúncio, servidores de leilão e rastreadores mais comuns (subdomínios entram junto).
const DOMAINS = new Set([
  // Google
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com',
  'google-analytics.com', 'googletagmanager.com', 'googletagservices.com', 'imasdk.googleapis.com',
  // Redes e leilões (header bidding)
  'amazon-adsystem.com', 'adnxs.com', 'rubiconproject.com', 'pubmatic.com', 'openx.net', 'casalemedia.com',
  'indexww.com', 'criteo.com', 'criteo.net', 'adsrvr.org', 'bidswitch.net', 'contextweb.com', 'smartadserver.com',
  'adform.net', 'serving-sys.com', 'sizmek.com', 'yieldmo.com', 'sharethrough.com', '33across.com', 'teads.tv',
  'media.net', 'advertising.com', 'adtechus.com', 'adroll.com', 'lijit.com', 'sovrn.com', 'gumgum.com',
  'triplelift.com', '3lift.com', 'spotxchange.com', 'spotx.tv', 'springserve.com', 'districtm.io', 'emxdgt.com',
  'yieldlab.net', 'adition.com', 'adscale.de', 'zedo.com', 'adblade.com', 'popads.net', 'popcash.net',
  'propellerads.com', 'adsterra.com', 'exoclick.com', 'juicyads.com', 'trafficjunky.net', 'hilltopads.net',
  // Recomendação patrocinada
  'taboola.com', 'outbrain.com', 'revcontent.com', 'mgid.com', 'zergnet.com', 'content.ad',
  // Medição e verificação de anúncio
  'scorecardresearch.com', 'quantserve.com', 'quantcount.com', 'moatads.com', 'doubleverify.com',
  'adsafeprotected.com', 'iasds01.com', 'chartbeat.com', 'chartbeat.net', 'comscore.com', 'imrworldwide.com',
  'dv.tech', 'adnami.io',
  // Segmentação de público e aviso "desligue o bloqueador"
  'permutive.app', 'permutive.com', 'prmutv.co', 'cxense.com', 'newsroom.bi', 'fundingchoicesmessages.google.com',
  // Anúncios próprios de portais brasileiros
  'ads-library.globo.com',
  // Pixels de redes sociais
  'connect.facebook.net', 'analytics.tiktok.com', 'ads.tiktok.com', 'ads-twitter.com', 'analytics.twitter.com',
  'ads.linkedin.com', 'px.ads.linkedin.com', 'snap.licdn.com', 'bat.bing.com', 'ads.yahoo.com',
  'analytics.yahoo.com', 'sc-static.net', 'ct.pinterest.com',
  // Análise de comportamento e gravação de sessão
  'hotjar.com', 'hotjar.io', 'mouseflow.com', 'clarity.ms', 'fullstory.com', 'crazyegg.com', 'luckyorange.com',
  'mixpanel.com', 'cdn.segment.com', 'api.segment.io', 'amplitude.com', 'heap.io', 'heapanalytics.com',
  'newrelic.com', 'nr-data.net', 'kissmetrics.com', 'optimizely.com', 'branch.io', 'app-measurement.com',
  'mc.yandex.ru',
]);

// Endereços de anúncio dentro de domínios que também servem conteúdo (o YouTube não pode ser bloqueado inteiro).
const PATH_RULES = [
  { host: /(^|\.)youtube\.com$/i, path: /^\/(pagead\/|api\/stats\/ads|ptracking|get_midroll_|youtubei\/v1\/player\/ad_break)/ },
];

// Espaços de anúncio comuns: escondidos para não sobrar buraco onde o anúncio foi cortado.
const HIDE_CSS = `
ins.adsbygoogle, .adsbygoogle, [id^="google_ads_iframe"], [id^="div-gpt-ad"], [id^="taboola-"],
.OUTBRAIN, .trc_rbox_container, iframe[src*="doubleclick.net"], iframe[src*="amazon-adsystem.com"]
{ display: none !important; }`;

// O host (ou um domínio acima dele) está na lista? "a.b.doubleclick.net" → sim.
function isBlockedHost(host) {
  let h = String(host || '').toLowerCase().replace(/\.$/, '');
  while (h.includes('.')) {
    if (DOMAINS.has(h)) return true;
    h = h.slice(h.indexOf('.') + 1);
  }
  return false;
}

// Bloquear esta requisição? A página principal (o que o usuário digitou ou clicou) sempre passa.
function shouldBlock(url, resourceType) {
  if (resourceType === 'mainFrame') return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (isBlockedHost(u.hostname)) return true;
    return PATH_RULES.some((r) => r.host.test(u.hostname) && r.path.test(u.pathname));
  } catch {
    return false;
  }
}

// Um botão só (AdBlock, na barra do mini navegador) liga e desliga o bloqueio em todas as sessões.
let enabled = true;
const setEnabled = (on) => { enabled = Boolean(on); };
const isEnabled = () => enabled;

// Liga o bloqueio numa sessão. onBlocked(webContentsId) avisa cada corte (para o contador da barra).
function attachAdblock(ses, onBlocked = () => {}) {
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, cb) => {
    const cancel = enabled && shouldBlock(details.url, details.resourceType);
    cb({ cancel });
    if (cancel) onBlocked(details.webContentsId);
  });
}

// Anúncio em áudio/vídeo do YouTube vem dos mesmos servidores da música: não dá para cortar na rede.
// Este script (mundo isolado da página) vê quando o player entra em modo anúncio, emudece, pula para o fim,
// aperta "Pular" e devolve o som quando a música volta. Instala uma vez por página; NEXUS liga/desliga.
const yt = (on) => `(() => {
  window.__nexusAdOn = ${on ? 'true' : 'false'};
  if (window.__nexusAdSkip) return;
  window.__nexusAdSkip = true;
  const SKIP = '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-overlay-close-button';
  let muted = null;
  setInterval(() => {
    const p = document.querySelector('#movie_player');
    const v = document.querySelector('video');
    if (!v) return;
    const ad = window.__nexusAdOn && p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting'));
    if (ad) {
      if (muted === null) muted = v.muted;
      v.muted = true;
      v.playbackRate = 16;
      if (Number.isFinite(v.duration) && v.duration > 0) v.currentTime = Math.max(v.duration - 0.1, 0);
      document.querySelectorAll(SKIP).forEach((b) => b.click());
    } else if (muted !== null) {
      v.muted = muted;
      v.playbackRate = 1;
      muted = null;
    }
  }, 250);
})()`;

module.exports = { attachAdblock, shouldBlock, isBlockedHost, setEnabled, isEnabled, HIDE_CSS, youtubeAdSkip: yt };
