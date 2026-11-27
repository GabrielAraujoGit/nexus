'use strict';
// NEXUS — leitura de arquivo para o visualizador da interface. Só abre um nome da pasta atual do shell
// (nada de caminho, "..", nem pasta), com limite de tamanho, e devolve texto, imagem (data URL) ou um
// trecho em hexadecimal para binários.
const fs = require('node:fs/promises');
const path = require('node:path');

const TEXT_MAX = 512 * 1024; // texto: mostra até 512 KB
const IMAGE_MAX = 10 * 1024 * 1024; // imagem: até 10 MB
const HEX_BYTES = 1024; // binário: o começo em hexadecimal
const IMAGES = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif', svg: 'image/svg+xml',
};

function validName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 255
    && !name.includes('/') && !name.includes('\0') && name !== '.' && name !== '..';
}

async function readHead(file, max) {
  const fh = await fs.open(file, 'r');
  try {
    const buf = Buffer.alloc(max);
    const { bytesRead } = await fh.read(buf, 0, max, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

// Binário: tem byte nulo, ou muito caractere de controle, no começo.
function looksBinary(buf) {
  const sample = buf.subarray(0, 8192);
  if (sample.includes(0)) return true;
  let ctrl = 0;
  for (const b of sample) if (b < 9 || (b > 13 && b < 32)) ctrl++;
  return sample.length > 0 && ctrl / sample.length > 0.1;
}

function hexDump(buf) {
  const lines = [];
  for (let off = 0; off < buf.length; off += 16) {
    const row = buf.subarray(off, off + 16);
    const hex = [...row].map((b) => b.toString(16).padStart(2, '0')).join(' ').padEnd(47, ' ');
    const ascii = [...row].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '·')).join('');
    lines.push(`${off.toString(16).padStart(8, '0')}  ${hex}  ${ascii}`);
  }
  return lines.join('\n');
}

async function readForView(dir, name) {
  if (!validName(name)) return { error: 'nome inválido' };
  const file = path.join(dir, name);
  let st;
  try {
    st = await fs.stat(file);
  } catch (err) {
    return { error: err.code === 'EACCES' ? 'sem permissão' : 'arquivo não encontrado' };
  }
  if (!st.isFile()) return { error: 'não é um arquivo comum' };
  const base = { name, size: st.size, mtime: st.mtimeMs };
  const ext = path.extname(name).slice(1).toLowerCase();
  try {
    if (IMAGES[ext]) {
      if (st.size > IMAGE_MAX) return { ...base, error: 'imagem grande demais para mostrar (máx. 10 MB)' };
      const buf = await fs.readFile(file);
      return { ...base, kind: 'image', data: `data:${IMAGES[ext]};base64,${buf.toString('base64')}` };
    }
    const buf = await readHead(file, TEXT_MAX);
    if (looksBinary(buf)) return { ...base, kind: 'binary', text: hexDump(buf.subarray(0, HEX_BYTES)) };
    return { ...base, kind: 'text', text: buf.toString('utf8'), truncated: st.size > TEXT_MAX };
  } catch (err) {
    return { ...base, error: err.code === 'EACCES' ? 'sem permissão' : 'não deu para ler o arquivo' };
  }
}

module.exports = { readForView, validName };
