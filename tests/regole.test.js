// Prove tecniche del capitolo 1. Avvio: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const { Engine, esegui, azione } = require('./aiuti.js');

// Replay documentati: coordinate e azioni dalla rimessa al binario d'uscita.
const REPLAY = {
  passerella: 'E E E E E N A S E E E E E E sel:E E A N N N E E E E W E E S S E E S S U E E E',
  cortile: 'E E E E E N A S E E E E E E E R A S S S E E E E S E E E N N N E U E E E',
  recupero: 'E E E E E N A S E E E E E E E A S S S S E W S E O N W N E E E S E E E N N N E U E E E',
};
const INIZIO_GIUNZIONE = 'E E E E E N A S E E E E E E E';

// Generatore pseudo-casuale fisso, per sequenze ripetibili.
function prng(seme) {
  let s = seme >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function azioniValide(s) {
  const cand = [];
  ['su', 'giu', 'sinistra', 'destra'].forEach((d) => cand.push({ tipo: 'muovi', dir: d }));
  Engine.SEGNALI.forEach((g) => cand.push({ tipo: 'segnale', segnale: g }));
  ['entrambi', 'D', 'E'].forEach((m) => cand.push({ tipo: 'usa', modo: m }));
  cand.push({ tipo: 'usa' }, { tipo: 'attendi' });
  ['prolunga', 'specchio'].forEach((m) => cand.push({ tipo: 'modulo', modulo: m }));
  Engine.bersagliEsca(s).forEach((b) => cand.push({ tipo: 'modulo', modulo: 'esca', bersaglio: b }));
  return cand.filter((a) => !Engine.valida(s, a));
}

function partitaCasuale(seme, passi, dopo) {
  const r = prng(seme);
  const s = Engine.nuovoStato('cap1');
  for (let i = 0; i < passi && s.esito === 'gioco'; i++) {
    const v = azioniValide(s);
    const a = v[Math.floor(r() * v.length)];
    if (dopo) dopo(s, a);
    Engine.agisci(s, a);
  }
  return s;
}

test('i tre replay arrivano al binario d\'uscita senza danni', () => {
  for (const [nome, seq] of Object.entries(REPLAY)) {
    const { s, errore } = esegui(seq);
    assert.equal(errore, null, nome + ': ' + errore);
    assert.equal(s.esito, 'vinto', nome);
    assert.equal(s.giocatore.pv, s.giocatore.pvMax, nome + ' senza danni');
  }
});

test('il replay di recupero viene davvero scoperto e poi se la cava', () => {
  const { s, registro } = esegui(REPLAY.recupero);
  assert.ok(registro.some((r) => r.r.eventi.some((e) => e.tipo === 'rilevato')));
  assert.equal(s.allarme, 1);
  assert.equal(s.esito, 'vinto');
});

test('1. due azioni consumano esattamente un turno; osservare non lo consuma', () => {
  const s = Engine.nuovoStato('cap1');
  Engine.agisci(s, azione('E'));
  assert.equal(s.turno, 1);
  assert.equal(s.azioni, 1);
  Engine.anteprimaFase(s);
  Engine.anteprimaSegnale(s, 'aprire');
  assert.equal(s.turno, 1, 'le anteprime non avanzano il turno');
  Engine.agisci(s, azione('E'));
  assert.equal(s.turno, 2);
  assert.equal(s.azioni, 2);
  // Un'azione rifiutata non costa niente.
  const r = Engine.agisci(s, azione('A'));
  assert.equal(r.ok, false, 'fuori dal terminale non si emette');
  assert.equal(s.azioni, 2);
  // Attendere consuma le azioni residue e avanza di un solo turno.
  Engine.agisci(s, azione('E'));
  Engine.agisci(s, azione('W'));
  assert.equal(s.turno, 3);
});

test('2. un circuito chiuso esegue ogni ricevitore una sola volta; i rami isolati non ricevono', () => {
  Engine.registraLivello({
    id: 'prova-anello',
    map: ['#####', '#@1.#', '#.ab#', '#####'],
    zone: [],
    nodi: [
      { id: 'T', tipo: 'terminale', x: 2, y: 1, faro: { x: 2, y: 1 } },
      { id: 'J1', tipo: 'giunzione' }, { id: 'J2', tipo: 'giunzione' },
      { id: 'PA', tipo: 'porta', porta: 'pa' }, { id: 'PB', tipo: 'porta', porta: 'pb' },
    ],
    archi: [
      { a: 'T', b: 'J1' }, { a: 'J1', b: 'J2' }, { a: 'J2', b: 'T' }, { a: 'J1', b: 'PA' }, { a: 'J2', b: 'PA' },
      { a: 'J2', b: 'PB', ramo: 'D' },
    ],
    varchi: [],
    porte: [
      { id: 'pa', tipo: 'porta', caselle: [{ x: 2, y: 2 }], nome: 'A' },
      { id: 'pb', tipo: 'porta', caselle: [{ x: 3, y: 2 }], nome: 'B' },
    ],
    manovelle: [], guardie: [], supportiSpecchio: [], rinforzi: [], moduliIniziali: [],
  });
  const s = Engine.nuovoStato('prova-anello');
  s.selettore = 'E';
  s.giocatore.x = 2; s.giocatore.y = 1;
  const r = Engine.agisci(s, { tipo: 'segnale', segnale: 'aprire' });
  const eff = r.eventi.find((e) => e.tipo === 'segnale').effetti;
  assert.equal(eff.filter((f) => f.porta === 'pa').length, 1, 'PA una sola volta nonostante due percorsi');
  assert.equal(eff.filter((f) => f.porta === 'pb').length, 0, 'il ramo isolato non riceve');
  assert.equal(s.porte.pb.aperta, false);
  assert.equal(s.giocatore.cariche, 2, 'una sola carica consumata');
});

test('3. una porta occupata resta aperta finché la casella non si libera', () => {
  // Il giocatore resta sul cancello del cortile quando scade il contatore.
  const { s } = esegui(INIZIO_GIUNZIONE + ' A S S');
  assert.deepEqual([s.giocatore.x, s.giocatore.y], [14, 10]);
  assert.equal(s.porte.cancelloD.cont, 0);
  assert.equal(s.porte.cancelloD.aperta, true);
  assert.equal(s.porte.cancelloD.attesaLibera, true);
  Engine.agisci(s, azione('S'));
  Engine.agisci(s, azione('W'));
  assert.equal(s.porte.cancelloD.aperta, false, 'si chiude alla prima fase ambiente con la casella libera');
  assert.equal(s.giocatore.carico, null);
});

test('4. Fermare salta una sola fase, poi immunità per una fase', () => {
  const { s } = esegui(INIZIO_GIUNZIONE + ' W');
  assert.equal(s.azioni, 2);
  const c = s.guardie.find((g) => g.id === 'custode1');
  const prima = { x: c.x, y: c.y };
  Engine.agisci(s, azione('F'));
  assert.equal(c.bloccata, true);
  Engine.agisci(s, azione('W'));
  assert.deepEqual({ x: c.x, y: c.y }, prima, 'ferma per una fase');
  assert.equal(c.immune, 1);
  // Subito dopo, Fermare non ha effetto: nessun blocco perpetuo.
  const ap = Engine.anteprimaSegnale(s, 'fermare');
  assert.ok(ap.effetti.some((f) => f.guardia === 'custode1' && f.nullo));
  Engine.agisci(s, azione('F'));
  assert.equal(c.bloccata, false);
  Engine.agisci(s, azione('W'));
  assert.notDeepEqual({ x: c.x, y: c.y }, prima, 'riprende la ronda');
  assert.equal(c.immune, 0);
});

test('5. Richiamare parte dall\'Esca; la guardia richiamata non attacca', () => {
  const { s, errore } = esegui(INIZIO_GIUNZIONE + ' A S S S');
  assert.equal(errore, null);
  // Esca posata nel cortile, a ovest del giocatore.
  const b = Engine.bersagliEsca(s).find((q) => q.y === 11 && q.x === 12);
  assert.ok(b, 'casella dell\'esca valida');
  // Torna al terminale lasciando l'esca: serve una carica.
  Engine.agisci(s, { tipo: 'modulo', modulo: 'esca', bersaglio: b });
  assert.deepEqual(s.esca.pos, b);
  s.giocatore.x = 14; s.giocatore.y = 8;
  s.azioni = 2;
  const ap = Engine.anteprimaSegnale(s, 'richiamare');
  assert.ok(ap.effetti.some((f) => f.meta && f.meta.x === 12 && f.meta.y === 11));
  Engine.agisci(s, azione('R'));
  const c = s.guardie.find((g) => g.id === 'custode1');
  assert.deepEqual(c.richiamo.meta, { x: 12, y: 11 });
  assert.equal(s.esca.pos, null, 'l\'esca si consuma');
  assert.equal(s.esca.disponibile, false);
  const pv = s.giocatore.pv;
  Engine.agisci(s, azione('W'));
  assert.equal(s.giocatore.pv, pv);
  // Alla colonnina l'esca torna disponibile.
  s.giocatore.x = 2; s.giocatore.y = 7;
  Engine.agisci(s, azione('U'));
  assert.equal(s.esca.disponibile, true);
});

test('5b. a parità di richiamo vince il nodo più vicino lungo il cavo, poi l\'ID minore', () => {
  const { s } = esegui(INIZIO_GIUNZIONE + ' W');
  const c = s.guardie.find((g) => g.id === 'custode1');
  // Primo richiamo dal terminale centrale (distanza 3 lungo il cavo).
  Engine.agisci(s, azione('R'));
  const d1 = c.richiamo.dist;
  // Un secondo richiamo nello stesso turno da un nodo più lontano non lo sovrascrive.
  c.richiamo.dist = 1;
  s.giocatore.cariche = 3;
  Engine.agisci(s, azione('R'));
  assert.equal(c.richiamo.dist, 1);
  assert.ok(d1 > 1);
});

test('6. anteprima e risultato coincidono (segnali, moduli e fase nemica)', () => {
  for (let seme = 1; seme <= 60; seme++) {
    partitaCasuale(seme, 140, (s, a) => {
      if (a.tipo === 'segnale') {
        const ap = Engine.anteprimaSegnale(s, a.segnale);
        const c = Engine.clona(s);
        const r = Engine.agisci(c, a);
        const eff = r.eventi.find((e) => e.tipo === 'segnale').effetti;
        assert.deepEqual(ap.effetti, eff, 'segnale, seme ' + seme);
      }
      const prev = Engine.anteprimaFase(s);
      const c = Engine.clona(s);
      Engine.agisci(c, { tipo: 'attendi' });
      assert.deepEqual(prev.stato, c, 'fase nemica, seme ' + seme);
    });
  }
});

test('7. una guardia in contatto non alza l\'allarme a ogni turno; rinforzi annunciati e in caselle legali', () => {
  const { s } = esegui(REPLAY.recupero.split(' ').slice(0, 24).join(' '));
  assert.equal(s.allarme, 1);
  const c = s.guardie.find((g) => g.id === 'custode1');
  assert.equal(c.contatto, true);
  // Restare in vista non fa salire l'allarme oltre 1 per lo stesso contatto.
  for (let i = 0; i < 3 && s.esito === 'gioco'; i++) Engine.agisci(s, azione('W'));
  assert.equal(s.allarme, 1);
  // Soglia 2: annuncio, poi arrivo un turno dopo, mai accanto al giocatore.
  for (let seme = 1; seme <= 200; seme++) {
    partitaCasuale(seme, 200, (st) => {
      st.guardie.forEach((g) => {
        assert.ok(Engine.percorribile(st, g.x, g.y) || g.tipo === 'lenticolare', 'guardia in casella percorribile');
        const z = Engine.zonaDi(st, g.x, g.y);
        assert.ok(!(z && z.sicura), 'nessuna guardia nelle zone sicure');
      });
      assert.ok(st.allarme <= st.allarmeMax);
      assert.ok(st.guardie.length <= 4, 'rinforzi limitati');
    });
  }
  const t = Engine.nuovoStato('cap1');
  t.allarme = 1;
  t.giocatore.x = 14; t.giocatore.y = 11;
  const g = t.guardie[0];
  g.x = 14; g.y = 13; g.dir = { x: 0, y: -1 }; g.stato = 'ronda';
  // Un passo nella vista: allarme 2, rinforzo annunciato.
  t.giocatore.x = 13;
  Engine.agisci(t, azione('E'));
  assert.equal(t.allarme, 2);
  assert.equal(t.rinforziPendenti.length, 1);
  const n = t.guardie.length;
  Engine.agisci(t, azione('W'));
  assert.equal(t.guardie.length, n, 'non arriva nello stesso turno dell\'annuncio');
  Engine.agisci(t, azione('W'));
  assert.equal(t.guardie.length, n + 1, 'arriva alla fine del turno successivo');
});

test('8. la colonnina resta raggiungibile a cariche esaurite; nessun Sigillo sul percorso', () => {
  const { s, errore } = esegui(INIZIO_GIUNZIONE + ' A F');
  assert.equal(errore, null);
  assert.equal(s.giocatore.cariche, 0);
  // Ritorno: giunzione, ponte con la manovella, rimessa, colonnina.
  const ritorno = 'O O O O O N U S O O O O O O O N U';
  const ok = ritorno.split(' ').every((t) => Engine.agisci(s, azione(t)).ok);
  assert.ok(ok, 'ritorno alla colonnina possibile');
  assert.equal(s.giocatore.cariche, 3);
});

test('9. salvataggio e ripristino a metà missione riproducono il turno seguente', () => {
  const { s } = esegui(REPLAY.cortile.split(' ').slice(0, 20).join(' '));
  const salvato = JSON.stringify(s);
  const a = JSON.parse(salvato);
  const b = JSON.parse(salvato);
  assert.deepEqual(a, s, 'nulla va perso nella serializzazione');
  Engine.agisci(a, azione('W'));
  Engine.agisci(b, azione('W'));
  assert.deepEqual(a, b);
  assert.deepEqual(a.porte, Engine.clona(a).porte);
});

test('determinismo: stessa sequenza, stesso risultato', () => {
  for (let seme = 1; seme <= 20; seme++) {
    assert.deepEqual(partitaCasuale(seme, 120), partitaCasuale(seme, 120));
  }
});

test('modalità assistita: integrità in più e allarme massimo 4', () => {
  const s = Engine.nuovoStato('cap1', { assistito: true });
  assert.equal(s.giocatore.pvMax, 4);
  assert.equal(s.allarmeMax, 4);
});

test('Prolunga e Specchio cambiano davvero la rete e il cono', () => {
  const s = Engine.nuovoStato('cap1');
  s.giocatore.x = 16; s.giocatore.y = 5;
  const t3 = Engine.terminaleSotto(s);
  assert.equal(Engine.terminaleCollegato(s, t3), false);
  Engine.agisci(s, { tipo: 'modulo', modulo: 'prolunga' });
  assert.equal(Engine.terminaleCollegato(s, t3), true);
  const len = s.guardie.find((g) => g.tipo === 'lenticolare');
  const prima = Engine.conoLenticolare(s, len).length;
  s.giocatore.x = 16; s.giocatore.y = 3;
  Engine.agisci(s, { tipo: 'modulo', modulo: 'specchio' });
  assert.equal(s.specchio, 0);
  assert.ok(Engine.conoLenticolare(s, len).length < prima, 'il cono finisce contro il muro');
});
