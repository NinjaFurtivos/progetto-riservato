// Strumenti comuni ai test: carica il motore e il livello in Node.
const Engine = require('../src/engine.js');
const LEVEL1 = require('../src/level1.js');

Engine.registraLivello(LEVEL1);

const ABBR = {
  N: { tipo: 'muovi', dir: 'su' }, S: { tipo: 'muovi', dir: 'giu' },
  O: { tipo: 'muovi', dir: 'sinistra' }, E: { tipo: 'muovi', dir: 'destra' },
  A: { tipo: 'segnale', segnale: 'aprire' }, R: { tipo: 'segnale', segnale: 'richiamare' },
  F: { tipo: 'segnale', segnale: 'fermare' }, U: { tipo: 'usa' }, W: { tipo: 'attendi' },
  P: { tipo: 'modulo', modulo: 'prolunga' }, M: { tipo: 'modulo', modulo: 'specchio' },
};

// Converte "E E A N" o voci speciali ("sel:D", "esca:12,12") in azioni.
function azione(tok) {
  if (ABBR[tok]) return ABBR[tok];
  const [k, v] = tok.split(':');
  if (k === 'sel') return { tipo: 'usa', modo: v };
  if (k === 'esca') { const [x, y] = v.split(',').map(Number); return { tipo: 'modulo', modulo: 'esca', bersaglio: { x, y } }; }
  throw new Error('Azione sconosciuta: ' + tok);
}

// Esegue un replay; si ferma al primo errore. Restituisce lo stato e il registro.
function esegui(sequenza, opz) {
  const s = Engine.nuovoStato('cap1', opz);
  const registro = [];
  const toks = sequenza.trim().split(/\s+/);
  for (let i = 0; i < toks.length; i++) {
    const a = azione(toks[i]);
    const r = Engine.agisci(s, a);
    registro.push({ i, tok: toks[i], r, pos: { x: s.giocatore.x, y: s.giocatore.y }, turno: s.turno });
    if (!r.ok) return { s, registro, errore: 'passo ' + i + ' (' + toks[i] + '): ' + r.msg };
    if (s.esito !== 'gioco') break;
  }
  return { s, registro, errore: null };
}

function disegna(s) {
  const L = Engine.livello(s.livello);
  const righe = L.def.map.map((r) => r.split(''));
  Object.entries(s.porte).forEach(([id, st]) => {
    const pd = L.def.porte.find((p) => p.id === id);
    pd.caselle.forEach((c) => { righe[c.y][c.x] = st.aperta ? '_' : (pd.tipo === 'ponte' ? '~' : '|'); });
  });
  s.guardie.forEach((g) => { righe[g.y][g.x] = g.tipo === 'custode' ? 'C' : 'L'; });
  righe[s.giocatore.y][s.giocatore.x] = 'N';
  return righe.map((r) => r.join('')).join('\n');
}

module.exports = { Engine, LEVEL1, esegui, azione, disegna };
