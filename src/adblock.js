'use strict';
// NEXUS — bloqueador de anúncios e rastreadores do mini navegador, sem dependências.
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
    return isBlockedHost(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Liga o bloqueio numa sessão. onBlocked(webContentsId) avisa cada corte (para o contador da barra).
 * Devolve { setEnabled(bool), enabled(), css }.
 */
function attachAdblock(ses, onBlocked) {
  let enabled = true;
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, cb) => {
    const cancel = enabled && shouldBlock(details.url, details.resourceType);
    cb({ cancel });
    if (cancel) onBlocked(details.webContentsId);
  });
  return {
    setEnabled(on) { enabled = Boolean(on); },
    enabled: () => enabled,
    css: HIDE_CSS,
  };
}

module.exports = { attachAdblock, shouldBlock, isBlockedHost };
