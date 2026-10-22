// Regole del gioco, separate dalla presentazione.
// Tutto è deterministico: la stessa sequenza di azioni sullo stesso stato
// produce sempre lo stesso risultato. L'anteprima usa queste stesse funzioni
// su una copia dello stato.
(function (root) {
  'use strict';

  const VERSIONE = 1;
  const DIRS = { su: { x: 0, y: -1 }, giu: { x: 0, y: 1 }, sinistra: { x: -1, y: 0 }, destra: { x: 1, y: 0 } };
  const SEGNALI = ['aprire', 'richiamare', 'fermare'];
  const NOME_SEGNALE = { aprire: 'Aprire', richiamare: 'Richiamare', fermare: 'Fermare' };
  const SOGLIE_ALLARME = [2, 4];

  const livelli = {};

  function registraLivello(def) {
    const H = def.map.length;
    const W = def.map[0].length;
    def.map.forEach((r, y) => {
      if (r.length !== W) throw new Error('Riga ' + y + ' di lunghezza ' + r.length + ' invece di ' + W);
    });
    const L = { def, W, H, nodi: {}, adiacenze: {}, speciali: {} };
    def.nodi.forEach((n) => { L.nodi[n.id] = n; L.adiacenze[n.id] = []; });
    def.archi.forEach((e, i) => {
      L.adiacenze[e.a].push({ to: e.b, arco: i });
      L.adiacenze[e.b].push({ to: e.a, arco: i });
    });
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = def.map[y][x];
        if ('@bRrS123KT'.includes(c)) {
          (L.speciali[c] = L.speciali[c] || []).push({ x, y });
        }
      }
    }
    L.portaDiCasella = {};
    def.porte.forEach((p) => p.caselle.forEach((c) => { L.portaDiCasella[c.x + ',' + c.y] = p.id; }));
    livelli[def.id] = L;
    return L;
  }

  function liv(s) { return livelli[s.livello]; }
  function clona(s) { return JSON.parse(JSON.stringify(s)); }
  function stessa(a, b) { return a && b && a.x === b.x && a.y === b.y; }
  function manhattan(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

  function nuovoStato(livelloId, opz) {
    opz = opz || {};
    const L = livelli[livelloId];
    const d = L.def;
    const start = L.speciali['@'][0];
    const assistito = !!opz.assistito;
    const s = {
      versione: VERSIONE,
      livello: livelloId,
      seme: opz.seme || 1,
      assistito,
      turno: 1,
      azioni: 2,
      esito: 'gioco',
      giocatore: {
        x: start.x, y: start.y, dir: { x: 1, y: 0 },
        pv: assistito ? 4 : 3, pvMax: assistito ? 4 : 3,
        cariche: 3, caricheMax: 3, carico: null,
      },
      porte: {},
      selettore: 'entrambi',
      varchi: {},
      specchio: null,
      esca: { disponibile: true, pos: null },
      moduli: d.moduliIniziali.slice(),
      guardie: d.guardie.map((g) => creaGuardia(g)),
      allarme: 0,
      allarmeMax: assistito ? 4 : 6,
      soglie: [],
      rinforziPendenti: [],
      rinforziUsati: 0,
      flag: { biglietto: false, pontePassato: false, visteZone: ['A'] },
      diario: [],
    };
    d.porte.forEach((p) => { s.porte[p.id] = { aperta: false, cont: 0, attesaLibera: false }; });
    d.varchi.forEach((v) => { s.varchi[v.id] = false; });
    return s;
  }

  function creaGuardia(g) {
    if (g.tipo === 'custode') {
      const r = g.ronda;
      const idx = g.rondaIdx || 0;
      const dirR = g.dirRonda || 1;
      const g2 = {
        id: g.id, tipo: 'custode', x: g.x, y: g.y, dir: { x: 0, y: 1 },
        ronda: r, rondaIdx: idx, dirRonda: dirR,
        stato: 'ronda', contatto: false, bloccata: false, immune: 0,
        bersaglio: null, armato: 0, ultimo: null, perso: 0, richiamo: null,
      };
      orientaRonda(g2);
      return g2;
    }
    return {
      id: g.id, tipo: 'lenticolare', x: g.x, y: g.y, dir: g.dir,
      prossima: g.prossima || 'tiro', contatto: false, colpito: -99,
      bloccata: false, immune: 0,
    };
  }

  // ---------- Mappa ----------

  function cella(s, x, y) {
    const L = liv(s);
    if (x < 0 || y < 0 || x >= L.W || y >= L.H) return '#';
    return L.def.map[y][x];
  }

  function portaIn(s, x, y) { return liv(s).portaDiCasella[x + ',' + y]; }

  function zonaDi(s, x, y) {
    const z = liv(s).def.zone.find((z) => x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1);
    return z || null;
  }

  function percorribile(s, x, y) {
    const c = cella(s, x, y);
    if (c === '#' || c === 'm' || c === 'L') return false;
    const p = portaIn(s, x, y);
    if (p) return s.porte[p].aperta;
    if (c === '~') return false;
    if (c === 'X') return s.flag.biglietto;
    return true;
  }

  function opaca(s, x, y) {
    const c = cella(s, x, y);
    if (c === '#' || c === 'm' || c === 'L') return true;
    if (c === 'X') return !s.flag.biglietto;
    const p = portaIn(s, x, y);
    if (p && liv(s).def.porte.find((q) => q.id === p).tipo === 'porta') return !s.porte[p].aperta;
    return false;
  }

  function guardiaIn(s, x, y) {
    return s.guardie.find((g) => g.x === x && g.y === y) || null;
  }

  function occupata(s, x, y) {
    return (s.giocatore.x === x && s.giocatore.y === y) || !!guardiaIn(s, x, y);
  }

  function percorribileGuardia(s, x, y) {
    if (!percorribile(s, x, y)) return false;
    const z = zonaDi(s, x, y);
    return !(z && z.sicura);
  }

  // Primo passo del cammino minimo (BFS con ordine fisso delle direzioni).
  function primoPasso(s, da, a) {
    if (stessa(da, a)) return null;
    const ordine = [DIRS.su, DIRS.destra, DIRS.giu, DIRS.sinistra];
    const key = (p) => p.x + ',' + p.y;
    const prec = {};
    prec[key(da)] = null;
    const coda = [da];
    while (coda.length) {
      const p = coda.shift();
      if (stessa(p, a)) break;
      for (const d of ordine) {
        const q = { x: p.x + d.x, y: p.y + d.y };
        if (key(q) in prec) continue;
        if (!percorribileGuardia(s, q.x, q.y)) continue;
        prec[key(q)] = p;
        coda.push(q);
      }
    }
    if (!(key(a) in prec)) return null;
    let p = a;
    while (!stessa(prec[key(p)], da)) p = prec[key(p)];
    return p;
  }

  // ---------- Circuito ----------

  function arcoAttivo(s, e) {
    if (!e.ramo) return true;
    return s.selettore === 'entrambi' || s.selettore === e.ramo;
  }

  function terminaleSotto(s) {
    const L = liv(s);
    const p = s.giocatore;
    return L.def.nodi.find((n) => n.tipo === 'terminale' && n.x === p.x && n.y === p.y) || null;
  }

  // Raggiungibilità dal nodo emittente: ogni nodo è visitato una sola volta,
  // quindi i circuiti chiusi non generano emissioni ripetute.
  function propaga(s, origine) {
    const L = liv(s);
    const dist = {};
    dist[origine] = 0;
    const ordine = [origine];
    const coda = [origine];
    const vicini = (id) => {
      const out = [];
      L.adiacenze[id].forEach((a) => { if (arcoAttivo(s, L.def.archi[a.arco])) out.push(a.to); });
      L.def.varchi.forEach((v) => {
        if (!s.varchi[v.id]) return;
        if (v.a === id) out.push(v.b);
        if (v.b === id) out.push(v.a);
      });
      return out.sort();
    };
    while (coda.length) {
      const id = coda.shift();
      for (const n of vicini(id)) {
        if (n in dist) continue;
        dist[n] = dist[id] + 1;
        ordine.push(n);
        coda.push(n);
      }
    }
    return ordine.map((id) => ({ id, dist: dist[id] }));
  }

  function terminaleCollegato(s, t) {
    // Un terminale è utile se raggiunge almeno un ricevitore.
    return propaga(s, t.id).some((n) => liv(s).nodi[n.id].tipo !== 'terminale' && liv(s).nodi[n.id].tipo !== 'presa' && liv(s).nodi[n.id].tipo !== 'giunzione');
  }

  function guardiaPerId(s, id) { return s.guardie.find((g) => g.id === id); }

  function nomeGuardia(g) { return g.tipo === 'custode' ? 'Custode' : 'Lenticolare'; }

  function emetti(s, nome, ev) {
    const L = liv(s);
    const t = terminaleSotto(s);
    const raggiunti = propaga(s, t.id);
    let faro = t.faro;
    let daEsca = false;
    if (nome === 'richiamare' && s.esca.pos) { faro = s.esca.pos; daEsca = true; }
    const effetti = [];
    raggiunti.forEach(({ id, dist }) => {
      const n = L.nodi[id];
      if (n.tipo === 'porta') {
        const pd = L.def.porte.find((p) => p.id === n.porta);
        const st = s.porte[n.porta];
        if (nome === 'aprire') {
          st.aperta = true; st.cont = 2; st.attesaLibera = false;
          effetti.push({ nodo: id, porta: n.porta, testo: pd.nome + ': aperto per 2 fasi', caselle: pd.caselle });
        } else {
          effetti.push({ nodo: id, porta: n.porta, testo: pd.nome + ': nessun effetto', nullo: true, caselle: pd.caselle });
        }
      } else if (n.tipo === 'antenna') {
        const g = guardiaPerId(s, n.guardia);
        if (!g) return;
        const pos = [{ x: g.x, y: g.y }];
        if (nome === 'fermare') {
          if (g.immune > 0) effetti.push({ nodo: id, guardia: g.id, testo: nomeGuardia(g) + ': immune a Fermare in questa fase', nullo: true, caselle: pos });
          else { g.bloccata = true; effetti.push({ nodo: id, guardia: g.id, testo: nomeGuardia(g) + ': salta la prossima fase', caselle: pos }); }
        } else if (nome === 'richiamare' && g.tipo === 'custode') {
          const r = g.richiamo;
          const meglio = !r || r.turno !== s.turno || dist < r.dist || (dist === r.dist && t.id < r.da);
          if (meglio) {
            g.richiamo = { meta: { x: faro.x, y: faro.y }, dist, da: t.id, turno: s.turno, attesa: 2 };
            g.stato = 'richiamo';
          }
          effetti.push({ nodo: id, guardia: g.id, testo: 'Custode: si dirige verso il richiamo', caselle: pos, meta: faro });
        } else {
          effetti.push({ nodo: id, guardia: g.id, testo: nomeGuardia(g) + ': nessun effetto', nullo: true, caselle: pos });
        }
      }
    });
    if (nome === 'richiamare' && daEsca) {
      s.esca.pos = null;
      s.esca.disponibile = false;
      ev.push({ tipo: 'info', testo: 'L\'Esca ha emesso il richiamo e si è consumata.' });
    }
    if (!effetti.length) effetti.push({ testo: 'Nessun ricevitore collegato', nullo: true });
    return effetti;
  }

  // ---------- Visione ----------

  function visioneCustode(s, g) {
    const out = [];
    for (let d = 1; d <= 3; d++) {
      const x = g.x + g.dir.x * d, y = g.y + g.dir.y * d;
      if (opaca(s, x, y)) break;
      out.push({ x, y });
    }
    return out;
  }

  function direzioneLenticolare(s, g) {
    if (s.specchio != null) {
      const sup = liv(s).def.supportiSpecchio[s.specchio];
      if (sup.torretta === g.id) return sup.dir;
    }
    return g.dir;
  }

  function conoLenticolare(s, g) {
    const dir = direzioneLenticolare(s, g);
    const perp = { x: dir.y, y: dir.x };
    const out = [];
    const ok = {};
    for (let d = 1; d <= 3; d++) {
      const w = d === 1 ? 0 : 1;
      for (let o = -w; o <= w; o++) {
        const x = g.x + dir.x * d + perp.x * o, y = g.y + dir.y * d + perp.y * o;
        if (opaca(s, x, y)) continue;
        // La casella deve "vedere" la torretta attraverso la casella precedente.
        const po = Math.max(-(d === 2 ? 0 : 1), Math.min(d === 2 ? 0 : 1, o));
        const prev = d === 1 ? null : (g.x + dir.x * (d - 1) + perp.x * po) + ',' + (g.y + dir.y * (d - 1) + perp.y * po);
        if (prev && !ok[prev]) continue;
        ok[x + ',' + y] = true;
        out.push({ x, y });
      }
    }
    return out;
  }

  function vedeGiocatore(s, g) {
    const p = s.giocatore;
    const z = zonaDi(s, p.x, p.y);
    if (z && z.sicura) return false;
    if (g.tipo === 'custode') return visioneCustode(s, g).some((c) => stessa(c, p));
    return conoLenticolare(s, g).some((c) => stessa(c, p));
  }

  // ---------- Allarme ----------

  function alzaAllarme(s, ev) {
    if (s.allarme >= s.allarmeMax) return;
    s.allarme++;
    ev.push({ tipo: 'allarme', testo: 'Allarme ' + s.allarme + '/' + s.allarmeMax });
    const L = liv(s);
    SOGLIE_ALLARME.forEach((soglia) => {
      if (s.allarme >= soglia && !s.soglie.includes(soglia) && soglia <= s.allarmeMax) {
        s.soglie.push(soglia);
        if (s.rinforziUsati < L.def.rinforzi.length * 2) {
          const idx = s.rinforziUsati % L.def.rinforzi.length;
          s.rinforziUsati++;
          s.rinforziPendenti.push({ idx, turno: s.turno + 1 });
          const r = L.def.rinforzi[idx];
          ev.push({ tipo: 'avviso', testo: 'Rinforzi annunciati: arriveranno alla fine del prossimo turno', x: r.x, y: r.y });
        }
      }
    });
  }

  function rileva(s, g, t, ev) {
    if (!g.contatto) { g.contatto = true; alzaAllarme(s, ev); }
    g.stato = 'mira';
    g.richiamo = null;
    g.bersaglio = { x: s.giocatore.x, y: s.giocatore.y };
    g.armato = t;
    ev.push({ tipo: 'rilevato', testo: 'Il Custode ti ha visto: colpirà la casella segnata alla fine del prossimo turno', x: g.bersaglio.x, y: g.bersaglio.y });
  }

  function danno(s, ev, fonte) {
    s.giocatore.pv = Math.max(0, s.giocatore.pv - 1);
    ev.push({ tipo: 'danno', testo: fonte + ' ti colpisce: integrità ' + s.giocatore.pv + '/' + s.giocatore.pvMax });
    if (s.giocatore.pv <= 0) {
      s.esito = 'perso';
      ev.push({ tipo: 'fine', testo: 'Il tram resta in deposito. Riprova dall\'ingresso.' });
    }
  }

  // ---------- Guardie ----------

  function orientaRonda(g) {
    const r = g.ronda;
    let ni = g.rondaIdx + g.dirRonda;
    if (ni < 0 || ni >= r.length) { g.dirRonda = -g.dirRonda; ni = g.rondaIdx + g.dirRonda; }
    const n = r[ni];
    if (n && !(n.x === g.x && n.y === g.y)) g.dir = { x: Math.sign(n.x - g.x), y: Math.sign(n.y - g.y) };
  }

  function muoviVerso(s, g, meta) {
    const p = primoPasso(s, { x: g.x, y: g.y }, meta);
    if (!p || occupata(s, p.x, p.y)) {
      if (p) g.dir = { x: p.x - g.x, y: p.y - g.y };
      return false;
    }
    g.dir = { x: p.x - g.x, y: p.y - g.y };
    g.x = p.x; g.y = p.y;
    return true;
  }

  function guardaVersoProssimo(s, g, meta) {
    const p = primoPasso(s, { x: g.x, y: g.y }, meta);
    if (p) g.dir = { x: p.x - g.x, y: p.y - g.y };
  }

  function agisciCustode(s, g, t, ev) {
    const p = s.giocatore;
    switch (g.stato) {
      case 'mira': {
        if (g.armato < t) {
          if (stessa(p, g.bersaglio) && vedeGiocatore(s, g)) danno(s, ev, 'Il Custode');
          else ev.push({ tipo: 'info', testo: 'Il Custode colpisce a vuoto.' });
          if (s.esito !== 'gioco') return;
          if (vedeGiocatore(s, g)) {
            g.bersaglio = { x: p.x, y: p.y }; g.armato = t;
            ev.push({ tipo: 'rilevato', testo: 'Il Custode prende di nuovo la mira', x: p.x, y: p.y });
          } else {
            g.stato = 'cerca'; g.ultimo = g.bersaglio; g.perso = 0; g.bersaglio = null;
          }
        }
        return;
      }
      case 'cerca': {
        if (!stessa(g, g.ultimo)) muoviVerso(s, g, g.ultimo);
        g.perso++;
        if (g.perso >= 2) {
          g.stato = 'ritorno'; g.contatto = false;
          ev.push({ tipo: 'info', testo: 'Il Custode ha perso le tue tracce.' });
        }
        break;
      }
      case 'richiamo': {
        const r = g.richiamo;
        if (stessa(g, r.meta)) {
          r.attesa--;
          if (r.attesa <= 0) { g.stato = 'ritorno'; g.richiamo = null; }
        } else {
          const mosso = muoviVerso(s, g, r.meta);
          if (!mosso) {
            r.attesa--;
            if (r.attesa <= -2) { g.stato = 'ritorno'; g.richiamo = null; }
          }
          if (g.richiamo && !stessa(g, r.meta)) guardaVersoProssimo(s, g, r.meta);
        }
        break;
      }
      case 'ritorno': {
        const meta = g.ronda[g.rondaIdx];
        if (!stessa(g, meta)) muoviVerso(s, g, meta);
        if (stessa(g, meta)) { g.stato = 'ronda'; orientaRonda(g); }
        else guardaVersoProssimo(s, g, meta);
        break;
      }
      default: {
        let ni = g.rondaIdx + g.dirRonda;
        if (ni < 0 || ni >= g.ronda.length) { g.dirRonda = -g.dirRonda; ni = g.rondaIdx + g.dirRonda; }
        if (muoviVerso(s, g, g.ronda[ni])) {
          if (stessa(g, g.ronda[ni])) g.rondaIdx = ni;
          orientaRonda(g);
        }
      }
    }
    if (g.stato !== 'mira' && vedeGiocatore(s, g)) rileva(s, g, t, ev);
  }

  function agisciLenticolare(s, g, t, ev) {
    if (g.prossima === 'tiro') {
      if (vedeGiocatore(s, g)) {
        danno(s, ev, 'La Lenticolare');
        if (!g.contatto) { g.contatto = true; alzaAllarme(s, ev); }
        g.colpito = t;
      }
      g.prossima = 'carica';
    } else {
      g.prossima = 'tiro';
    }
    if (t - g.colpito >= 2) g.contatto = false;
  }

  function faseNemica(s, ev) {
    const t = s.turno;
    // Le guardie agiscono in ordine di iniziativa (ordine dell'elenco).
    for (const g of s.guardie) {
      if (s.esito !== 'gioco') break;
      if (g.bloccata) {
        g.bloccata = false; g.immune = 1;
        ev.push({ tipo: 'info', testo: nomeGuardia(g) + ' resta ferma per questa fase.' });
        continue;
      }
      if (g.tipo === 'custode') agisciCustode(s, g, t, ev);
      else agisciLenticolare(s, g, t, ev);
      if (g.immune > 0) g.immune--;
    }
  }

  function faseAmbiente(s, ev) {
    const L = liv(s);
    L.def.porte.forEach((pd) => {
      const st = s.porte[pd.id];
      if (!st.aperta) return;
      if (st.cont > 0) st.cont--;
      if (st.cont === 0) {
        const occ = pd.caselle.some((c) => occupata(s, c.x, c.y));
        if (occ) {
          if (!st.attesaLibera) ev.push({ tipo: 'info', testo: pd.nome + ' è occupato: resta aperto finché non si libera.' });
          st.attesaLibera = true;
        } else {
          st.aperta = false; st.attesaLibera = false;
        }
      }
    });
    const rimasti = [];
    s.rinforziPendenti.forEach((r) => {
      const rd = L.def.rinforzi[r.idx];
      const vicino = manhattan(rd, s.giocatore) <= 1;
      if (s.turno >= r.turno && !occupata(s, rd.x, rd.y) && !vicino) {
        const id = 'rinforzo' + (s.guardie.length + 1);
        s.guardie.push(creaGuardia({ id, tipo: 'custode', x: rd.x, y: rd.y, ronda: rd.ronda, rondaIdx: 0, dirRonda: 1 }));
        ev.push({ tipo: 'avviso', testo: 'È arrivato un Custode di rinforzo.', x: rd.x, y: rd.y });
      } else rimasti.push(r);
    });
    s.rinforziPendenti = rimasti;
  }

  function fineTurno(s, ev) {
    faseNemica(s, ev);
    if (s.esito === 'gioco') faseAmbiente(s, ev);
    s.turno++;
    s.azioni = 2;
  }

  // ---------- Azioni del giocatore ----------

  function annotaDiario(s, chiave, testo, ev) {
    if (s.diario.some((d) => d.chiave === chiave)) return;
    s.diario.push({ chiave, testo, turno: s.turno });
    ev.push({ tipo: 'diario', testo });
  }

  function dopoPasso(s, ev) {
    const p = s.giocatore;
    const z = zonaDi(s, p.x, p.y);
    if (z && !s.flag.visteZone.includes(z.id)) {
      s.flag.visteZone.push(z.id);
      ev.push({ tipo: 'zona', zona: z.id, testo: z.nome });
    }
    if (p.x > 8 && !s.flag.pontePassato) s.flag.pontePassato = true;
    // Ogni passo aggiorna subito visibilità e rilevamento.
    for (const g of s.guardie) {
      if (g.tipo === 'custode' && g.stato !== 'mira' && vedeGiocatore(s, g)) rileva(s, g, s.turno, ev);
    }
    if (z && z.id === 'G' && s.flag.biglietto) {
      s.esito = 'vinto';
      ev.push({ tipo: 'fine', testo: 'Il tram è fuori dal deposito.' });
    }
  }

  function lineaLibera(s, da, a, max) {
    if (da.x !== a.x && da.y !== a.y) return false;
    const d = manhattan(da, a);
    if (d < 1 || d > max) return false;
    const sx = Math.sign(a.x - da.x), sy = Math.sign(a.y - da.y);
    for (let i = 1; i <= d; i++) {
      const x = da.x + sx * i, y = da.y + sy * i;
      if (opaca(s, x, y)) return false;
      if (cella(s, x, y) === '~' && !portaIn(s, x, y)) continue;
    }
    return percorribile(s, a.x, a.y) && !occupata(s, a.x, a.y);
  }

  function bersagliEsca(s) {
    const out = [];
    const p = s.giocatore;
    Object.values(DIRS).forEach((d) => {
      for (let i = 1; i <= 3; i++) {
        const q = { x: p.x + d.x * i, y: p.y + d.y * i };
        if (opaca(s, q.x, q.y)) break;
        if (lineaLibera(s, p, q, 3)) out.push(q);
      }
    });
    return out;
  }

  // Controlla un'azione senza eseguirla: restituisce un messaggio d'errore o null.
  function valida(s, a) {
    if (s.esito !== 'gioco') return 'La missione è terminata.';
    const p = s.giocatore;
    const c = cella(s, p.x, p.y);
    switch (a.tipo) {
      case 'muovi': {
        const d = DIRS[a.dir];
        if (!d) return 'Direzione sconosciuta.';
        const x = p.x + d.x, y = p.y + d.y;
        if (cella(s, x, y) === 'X' && !s.flag.biglietto) return 'L\'uscita si apre solo con il biglietto.';
        if (!percorribile(s, x, y)) return 'Passaggio bloccato.';
        if (guardiaIn(s, x, y)) return 'C\'è una guardia.';
        return null;
      }
      case 'segnale': {
        if (!SEGNALI.includes(a.segnale)) return 'Segnale sconosciuto.';
        const t = terminaleSotto(s);
        if (!t) return 'Devi stare su un terminale per emettere.';
        if (!terminaleCollegato(s, t)) return 'Questo terminale non è collegato a niente.';
        if (p.cariche <= 0) return 'Trasmettitore scarico: torna alla colonnina.';
        return null;
      }
      case 'usa': {
        if (c === 'R') {
          if (p.cariche === p.caricheMax && (s.esca.disponibile || s.esca.pos)) return 'Sei già carica.';
          return null;
        }
        if (c === 'S') {
          if (!['entrambi', 'D', 'E'].includes(a.modo)) return 'Scegli quale ramo collegare.';
          if (a.modo === s.selettore) return 'Il selettore è già in quella posizione.';
          return null;
        }
        if (c === 'K') return null;
        if (c === 'T') return s.giocatore.carico ? 'Hai già il biglietto.' : null;
        return 'Qui non c\'è niente da usare.';
      }
      case 'modulo': {
        if (!s.moduli.includes(a.modulo)) return 'Modulo non equipaggiato.';
        if (a.modulo === 'prolunga') {
          const v = varcoVicino(s);
          return v ? null : 'Serve un terminale con una presa vicina.';
        }
        if (a.modulo === 'specchio') {
          return supportoVicino(s) != null ? null : 'Nessun supporto per lo specchio qui accanto.';
        }
        if (a.modulo === 'esca') {
          if (!s.esca.disponibile && !s.esca.pos) return 'Esca consumata: si recupera alla colonnina.';
          if (!a.bersaglio) return 'Scegli dove posare l\'Esca.';
          if (!bersagliEsca(s).some((q) => stessa(q, a.bersaglio))) return 'Serve una casella libera in linea retta entro 3.';
          return null;
        }
        return 'Modulo sconosciuto.';
      }
      case 'attendi': return null;
      default: return 'Azione sconosciuta.';
    }
  }

  function varcoVicino(s) {
    const L = liv(s);
    const p = s.giocatore;
    return L.def.varchi.find((v) => {
      const n = L.nodi[v.a];
      return manhattan(n, p) <= 1;
    }) || null;
  }

  function supportoVicino(s) {
    const L = liv(s);
    const i = L.def.supportiSpecchio.findIndex((sp) => manhattan(sp, s.giocatore) === 1);
    return i >= 0 ? i : null;
  }

  // Esegue un'azione. Restituisce { ok, msg, eventi, fineTurno }.
  function agisci(s, a) {
    const err = valida(s, a);
    if (err) return { ok: false, msg: err, eventi: [] };
    const ev = [];
    const p = s.giocatore;
    let costo = 1;
    switch (a.tipo) {
      case 'muovi': {
        const d = DIRS[a.dir];
        p.x += d.x; p.y += d.y; p.dir = d;
        dopoPasso(s, ev);
        break;
      }
      case 'segnale': {
        p.cariche--;
        const eff = emetti(s, a.segnale, ev);
        ev.push({ tipo: 'segnale', segnale: a.segnale, testo: NOME_SEGNALE[a.segnale] + ' emesso', effetti: eff });
        if (a.segnale === 'aprire' && terminaleSotto(s).id === 'TB') {
          annotaDiario(s, 'ponte', 'I segnali dell\'Organo arrivano solo dove arrivano i cavi.', ev);
        }
        break;
      }
      case 'usa': {
        const c = cella(s, p.x, p.y);
        if (c === 'R') {
          p.cariche = p.caricheMax;
          if (!s.esca.pos) s.esca.disponibile = true;
          ev.push({ tipo: 'info', testo: 'Trasmettitore ricaricato.' });
        } else if (c === 'S') {
          s.selettore = a.modo;
          const nomi = { entrambi: 'entrambi i rami', D: 'solo il ramo del cortile', E: 'solo il ramo della passerella' };
          ev.push({ tipo: 'info', testo: 'Selettore: ' + nomi[a.modo] + '.' });
        } else if (c === 'K') {
          const m = liv(s).def.manovelle.find((k) => k.x === p.x && k.y === p.y);
          const st = s.porte[m.porta];
          st.aperta = true; st.cont = 2; st.attesaLibera = false;
          ev.push({ tipo: 'info', testo: 'Manovella di servizio: ponte aperto per 2 fasi.' });
        } else if (c === 'T') {
          p.carico = 'biglietto';
          s.flag.biglietto = true;
          ev.push({ tipo: 'biglietto', testo: 'Hai recuperato il biglietto. L\'uscita è sbloccata.' });
          annotaDiario(s, 'biglietto', 'Il biglietto è obliterato e valido, ma il nome della fermata è stato raschiato via. Perché?', ev);
        }
        break;
      }
      case 'modulo': {
        if (a.modulo === 'prolunga') {
          const v = varcoVicino(s);
          s.varchi[v.id] = !s.varchi[v.id];
          ev.push({ tipo: 'info', testo: s.varchi[v.id] ? 'Prolunga posata: il terminale è collegato alla rete.' : 'Prolunga ripresa.' });
        } else if (a.modulo === 'specchio') {
          const i = supportoVicino(s);
          if (s.specchio === i) { s.specchio = null; ev.push({ tipo: 'info', testo: 'Specchio ripreso.' }); }
          else { s.specchio = i; ev.push({ tipo: 'info', testo: 'Specchio posato: il cono della Lenticolare è deviato.' }); }
        } else if (a.modulo === 'esca') {
          s.esca.pos = { x: a.bersaglio.x, y: a.bersaglio.y };
          s.esca.disponibile = false;
          ev.push({ tipo: 'info', testo: 'Esca posata: il prossimo Richiamare partirà da lì.' });
        }
        break;
      }
      case 'attendi':
        costo = s.azioni;
        ev.push({ tipo: 'info', testo: 'Attendi.' });
        break;
    }
    s.azioni -= costo;
    let finito = false;
    if (s.esito === 'gioco' && s.azioni <= 0) {
      fineTurno(s, ev);
      finito = true;
    }
    return { ok: true, eventi: ev, fineTurno: finito };
  }

  // ---------- Anteprime ----------

  function anteprimaSegnale(s, nome) {
    const c = clona(s);
    const err = valida(c, { tipo: 'segnale', segnale: nome });
    if (err) return { ok: false, msg: err };
    c.giocatore.cariche--;
    const effetti = emetti(c, nome, []);
    return { ok: true, effetti };
  }

  // Simula la fine del turno, come se il giocatore attendesse ora.
  function anteprimaFase(s) {
    const c = clona(s);
    if (c.esito !== 'gioco') return { guardie: [], eventi: [], stato: c };
    const ev = [];
    fineTurno(c, ev);
    return { stato: c, eventi: ev };
  }

  function descriviGuardia(s, g) {
    if (g.tipo === 'lenticolare') {
      if (g.bloccata) return 'Bloccata: salterà la prossima fase.';
      return g.prossima === 'tiro' ? 'Prossima fase: TIRO nel cono.' : 'Prossima fase: carica (innocua).';
    }
    if (g.bloccata) return 'Bloccata: salterà la prossima fase.';
    const testi = {
      ronda: 'Di ronda.',
      mira: 'Ti ha visto: colpirà la casella segnata.',
      cerca: 'Ti sta cercando.',
      richiamo: 'Segue il richiamo.',
      ritorno: 'Torna alla ronda.',
    };
    return testi[g.stato] + (g.immune ? ' Immune a Fermare.' : '');
  }

  const Engine = {
    VERSIONE, DIRS, SEGNALI, NOME_SEGNALE,
    registraLivello, nuovoStato, clona, agisci, valida,
    anteprimaSegnale, anteprimaFase, descriviGuardia,
    cella, percorribile, zonaDi, portaIn, terminaleSotto, terminaleCollegato, propaga,
    visioneCustode, conoLenticolare, bersagliEsca, varcoVicino, supportoVicino, guardiaIn,
    livello: (id) => livelli[id],
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.Engine = Engine;
})(this);
