// Presentazione e comandi. Le regole stanno in engine.js: qui si disegna,
// si mostrano le anteprime e si inoltrano le azioni.
(function () {
  'use strict';

  const E = window.Engine;
  const ST = window.STORIA;
  const AU = window.Audio2;
  E.registraLivello(window.LEVEL1);
  const L = E.livello('cap1');

  const CHIAVE_SALVA = 'vespera.salvataggio.v1';
  const CHIAVE_OPZ = 'vespera.impostazioni.v1';

  const TASTI_BASE = {
    su: 'w', giu: 's', sinistra: 'a', destra: 'd',
    aprire: '1', richiamare: '2', fermare: '3',
    prolunga: '4', specchio: '5', esca: '6',
    usa: 'e', attendi: ' ', annulla: 'z', aiuto: 'h', diario: 'j',
  };
  const NOMI_COMANDI = {
    su: 'Su', giu: 'Giù', sinistra: 'Sinistra', destra: 'Destra',
    aprire: 'Aprire', richiamare: 'Richiamare', fermare: 'Fermare',
    prolunga: 'Prolunga', specchio: 'Specchio', esca: 'Esca',
    usa: 'Interagisci', attendi: 'Fine turno', annulla: 'Annulla', aiuto: 'Suggerimento', diario: 'Diario',
  };

  const COL = {
    notte: '#0d1a1c', petrolio: '#16302f', petrolio2: '#1f4240', ottone: '#c9a24a', ottoneChiaro: '#e6c77a',
    finestra: '#f2b25c', carta: '#ece4d1', nebbia: '#9db1ab', pericolo: '#ee5d4f',
    aprire: '#f0b64a', richiamare: '#62c7d8', fermare: '#e77a92', vista: '#f4d36b',
  };
  const COL_SEGNALE = { aprire: COL.aprire, richiamare: COL.richiamare, fermare: COL.fermare };
  const PAVIMENTO = { A: '#2d2a21', B: '#263130', C: '#2c2b23', D: '#242c2a', E: '#1f2b2e', F: '#30271f', G: '#232a26' };

  // ---------- Stato dell'interfaccia ----------

  let opz = caricaOpzioni();
  let S = null;              // stato di gioco
  let pilaAnnulla = [];      // stati prima di ogni azione del turno corrente
  let inizioTurni = [];      // ultimi stati all'inizio del turno (riavvolgimento e ripristino)
  let modo = { tipo: 'normale' };
  let selezione = null;      // guardia selezionata
  let livelloAiuto = { ctx: null, n: 0 };
  let codaDialogo = [];
  let dopoDialogo = null;
  let impulsi = [];          // animazioni dei segnali
  let lampi = [];            // caselle evidenziate brevemente
  let anteprimaCache = null;
  let attesaTasto = null;    // comando da rimappare

  const $ = (id) => document.getElementById(id);
  const canvas = $('mappa');
  const g2 = canvas.getContext('2d');

  // Riquadro visibile: si escludono le righe di soli muri.
  const VISTA = (() => {
    let y0 = 0, y1 = L.H - 1;
    const vuota = (y) => !/[^#]/.test(L.def.map[y]);
    while (y0 < y1 && vuota(y0) && vuota(y0 + 1)) y0++;
    while (y1 > y0 && vuota(y1) && vuota(y1 - 1)) y1--;
    return { x0: 0, y0, w: L.W, h: y1 - y0 + 1 };
  })();
  let T = 32;

  // ---------- Opzioni e salvataggi ----------

  function caricaOpzioni() {
    const ridotte = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const base = { testoGrande: false, animRidotte: ridotte, lampeggi: true, assistito: false, suoni: 0.6, musica: 0.25, tasti: Object.assign({}, TASTI_BASE) };
    try {
      const o = JSON.parse(localStorage.getItem(CHIAVE_OPZ) || 'null');
      if (o) { Object.assign(base, o); base.tasti = Object.assign({}, TASTI_BASE, o.tasti || {}); }
    } catch (e) { /* archiviazione non disponibile */ }
    return base;
  }
  function salvaOpzioni() {
    try { localStorage.setItem(CHIAVE_OPZ, JSON.stringify(opz)); } catch (e) { /* ignorato */ }
  }
  function applicaOpzioni() {
    document.body.classList.toggle('testo-grande', !!opz.testoGrande);
    AU.volumi(opz.suoni, opz.musica);
    document.querySelectorAll('kbd[data-tasto]').forEach((k) => {
      const c = k.dataset.tasto;
      const t = c === 'annulla' ? opz.tasti.annulla : opz.tasti[c];
      k.textContent = nomeTasto(t);
    });
  }
  function nomeTasto(t) {
    if (t === ' ') return 'Spazio';
    if (!t) return '';
    return t.length === 1 ? t.toUpperCase() : t;
  }

  function salvaPartita() {
    if (!S) return;
    try {
      localStorage.setItem(CHIAVE_SALVA, JSON.stringify({ versione: E.VERSIONE, stato: S, istantanee: inizioTurni.slice(-3) }));
    } catch (e) { /* ignorato */ }
  }
  function leggiSalvataggio() {
    try {
      const d = JSON.parse(localStorage.getItem(CHIAVE_SALVA) || 'null');
      if (d && d.versione === E.VERSIONE && d.stato && d.stato.esito === 'gioco') return d;
    } catch (e) { /* ignorato */ }
    return null;
  }
  function cancellaSalvataggio() {
    try { localStorage.removeItem(CHIAVE_SALVA); } catch (e) { /* ignorato */ }
  }

  // ---------- Avvio ----------

  function mostraSchermo(id) {
    ['schermo-titolo', 'schermo-gioco'].forEach((s) => { $(s).hidden = s !== id; });
    if (id === 'schermo-gioco') ridimensiona();
  }

  function iniziaNuova() {
    S = E.nuovoStato('cap1', { assistito: opz.assistito, seme: 1 });
    S.flag.radio = [];
    S.flag.danni = 0;
    S.flag.allarmePicco = 0;
    pilaAnnulla = [];
    inizioTurni = [E.clona(S)];
    modo = { tipo: 'normale' };
    selezione = null;
    $('registro').innerHTML = '';
    mostraSchermo('schermo-gioco');
    aggiorna();
    AU.avvia();
    AU.musica(opz.musica > 0);
    dialogo(ST.apertura.concat(ST.guida.map((t) => ({ chi: 'Come si gioca', testo: t }))), () => {
      registra({ tipo: 'info', testo: 'Rimessa. La colonnina ricarica il trasmettitore.' });
    });
    salvaPartita();
  }

  function riprendi(dati, stato) {
    S = E.clona(stato || dati.stato);
    inizioTurni = (dati && dati.istantanee ? dati.istantanee.slice() : []);
    if (!inizioTurni.length) inizioTurni = [E.clona(S)];
    pilaAnnulla = [];
    modo = { tipo: 'normale' };
    $('registro').innerHTML = '';
    mostraSchermo('schermo-gioco');
    registra({ tipo: 'info', testo: 'Partita ripresa al turno ' + S.turno + '.' });
    AU.avvia();
    AU.musica(opz.musica > 0);
    aggiorna();
  }

  function ricominciaMissione() {
    // Stesso livello, stesso seme: si riparte dall'ingresso senza penalità.
    const vecchie = S ? S.flag.radio : [];
    S = E.nuovoStato('cap1', { assistito: opz.assistito, seme: S ? S.seme : 1 });
    S.flag.radio = vecchie.slice();
    S.flag.danni = 0;
    S.flag.allarmePicco = 0;
    pilaAnnulla = [];
    inizioTurni = [E.clona(S)];
    modo = { tipo: 'normale' };
    selezione = null;
    $('registro').innerHTML = '';
    chiudiFinestra();
    mostraSchermo('schermo-gioco');
    registra({ tipo: 'info', testo: 'Di nuovo in rimessa. Stessa notte, stesse ronde.' });
    aggiorna();
    salvaPartita();
  }

  // ---------- Azioni ----------

  function esegui(azione) {
    if (!S || S.esito !== 'gioco' || !$('dialogo').hidden || !$('finestra').hidden) return false;
    const err = E.valida(S, azione);
    if (err) { avviso(err); AU.suona('errore'); return false; }
    const prima = E.clona(S);
    const r = E.agisci(S, azione);
    if (!r.ok) { avviso(r.msg); return false; }
    if (r.fineTurno) {
      pilaAnnulla = [];
      inizioTurni.push(E.clona(S));
      if (inizioTurni.length > 4) inizioTurni.shift();
      AU.suona('turno');
    } else {
      pilaAnnulla.push(prima);
    }
    if (azione.tipo === 'muovi') AU.suona('passo');
    if (azione.tipo === 'usa') AU.suona('leva');
    modo = { tipo: 'normale' };
    gestisciEventi(r.eventi);
    S.flag.allarmePicco = Math.max(S.flag.allarmePicco || 0, S.allarme);
    aggiorna();
    if (r.fineTurno) salvaPartita();
    controllaEsito();
    return r;
  }

  function gestisciEventi(ev) {
    ev.forEach((e) => {
      if (e.tipo === 'segnale') {
        AU.suona(e.segnale);
        avviaImpulso(e.segnale);
        registra({ tipo: 'segnale', testo: e.testo + ': ' + e.effetti.filter((f) => !f.nullo).map((f) => f.testo).join('; ') });
        return;
      }
      if (e.tipo === 'danno') { AU.suona('danno'); S.flag.danni = (S.flag.danni || 0) + 1; lampo(S.giocatore, COL.pericolo); }
      if (e.tipo === 'allarme') AU.suona('allarme');
      if (e.tipo === 'biglietto') AU.suona('biglietto');
      if (e.tipo === 'zona') { radio(e.zona); registra({ tipo: 'info', testo: 'Zona: ' + e.testo }); return; }
      if (e.x != null) lampo(e, e.tipo === 'rilevato' ? COL.pericolo : COL.finestra);
      registra(e);
    });
    if (ev.some((e) => e.tipo === 'biglietto')) radio('biglietto');
    if (S.giocatore.cariche === 0 && !S.flag.radio.includes('scarico')) radio('scarico');
  }

  function radio(chiave) {
    if (!ST.radio[chiave] || S.flag.radio.includes(chiave)) return;
    S.flag.radio.push(chiave);
    dialogo(ST.radio[chiave]);
  }

  function controllaEsito() {
    if (S.esito === 'vinto') {
      cancellaSalvataggio();
      AU.suona('vittoria');
      setTimeout(() => dialogo(ST.chiusura, finestraVittoria), 350);
    } else if (S.esito === 'perso') {
      setTimeout(finestraSconfitta, 500);
    }
  }

  function annulla() {
    if (!S || S.esito !== 'gioco') return;
    if (modo.tipo !== 'normale') { modo = { tipo: 'normale' }; aggiorna(); return; }
    if (pilaAnnulla.length) {
      S = pilaAnnulla.pop();
      registra({ tipo: 'info', testo: 'Azione annullata.' });
      aggiorna();
      return;
    }
    if (S.assistito && inizioTurni.length >= 2) {
      inizioTurni.pop();
      S = E.clona(inizioTurni[inizioTurni.length - 1]);
      registra({ tipo: 'info', testo: 'Riavvolto all\'inizio del turno ' + S.turno + '.' });
      aggiorna();
      salvaPartita();
      return;
    }
    avviso(S.assistito ? 'Niente da annullare.' : 'Puoi annullare solo le azioni del turno in corso, prima della fase nemica.');
  }

  function scegliSegnale(nome) {
    if (!S) return;
    if (modo.tipo === 'segnale' && modo.segnale === nome) { confermaSegnale(); return; }
    const a = E.anteprimaSegnale(S, nome);
    if (!a.ok) { avviso(a.msg); AU.suona('errore'); return; }
    modo = { tipo: 'segnale', segnale: nome, effetti: a.effetti };
    aggiorna();
  }
  function confermaSegnale() {
    if (modo.tipo !== 'segnale') return;
    esegui({ tipo: 'segnale', segnale: modo.segnale });
  }

  function usaModulo(nome) {
    if (!S) return;
    if (nome === 'esca') {
      if (modo.tipo === 'esca') { modo = { tipo: 'normale' }; aggiorna(); return; }
      const err = E.valida(S, { tipo: 'modulo', modulo: 'esca', bersaglio: { x: -1, y: -1 } });
      if (err && !/linea retta/.test(err)) { avviso(err); return; }
      const b = E.bersagliEsca(S);
      if (!b.length) { avviso('Nessuna casella libera in linea retta entro 3.'); return; }
      modo = { tipo: 'esca', bersagli: b, idx: 0 };
      aggiorna();
      return;
    }
    esegui({ tipo: 'modulo', modulo: nome });
  }

  function interagisci() {
    if (!S) return;
    const c = E.cella(S, S.giocatore.x, S.giocatore.y);
    if (c === 'S') {
      modo = modo.tipo === 'selettore' ? { tipo: 'normale' } : { tipo: 'selettore' };
      aggiorna();
      return;
    }
    esegui({ tipo: 'usa' });
  }

  function muovi(dir) {
    if (modo.tipo === 'esca') {
      // Le frecce scorrono i bersagli validi.
      const d = E.DIRS[dir];
      const p = S.giocatore;
      const lungo = modo.bersagli.filter((b) => Math.sign(b.x - p.x) === d.x && Math.sign(b.y - p.y) === d.y);
      if (lungo.length) {
        const cur = modo.bersagli[modo.idx];
        const stessaLinea = lungo.findIndex((b) => b.x === cur.x && b.y === cur.y);
        const next = lungo[(stessaLinea + 1) % lungo.length];
        modo.idx = modo.bersagli.indexOf(next);
        aggiorna();
      }
      return;
    }
    if (modo.tipo !== 'normale' && modo.tipo !== 'percorso') modo = { tipo: 'normale' };
    esegui({ tipo: 'muovi', dir });
  }

  // Percorso automatico fuori pericolo: si ferma a ogni rilevamento o danno.
  function seguiPercorso(passi) {
    let i = 0;
    const passo = () => {
      if (i >= passi.length || !S || S.esito !== 'gioco') return;
      if (!$('dialogo').hidden) return;
      const r = esegui({ tipo: 'muovi', dir: passi[i++] });
      if (!r || r.eventi.some((e) => e.tipo === 'rilevato' || e.tipo === 'danno' || e.tipo === 'avviso')) return;
      if (S.guardie.some((g) => g.stato === 'mira')) return;
      setTimeout(passo, opz.animRidotte ? 30 : 110);
    };
    passo();
  }

  function cercaPercorso(da, a) {
    const key = (p) => p.x + ',' + p.y;
    const prec = { [key(da)]: null };
    const coda = [da];
    const nomi = ['su', 'destra', 'giu', 'sinistra'];
    while (coda.length) {
      const p = coda.shift();
      if (p.x === a.x && p.y === a.y) break;
      nomi.forEach((n) => {
        const d = E.DIRS[n];
        const q = { x: p.x + d.x, y: p.y + d.y };
        if (key(q) in prec) return;
        if (!E.percorribile(S, q.x, q.y) || E.guardiaIn(S, q.x, q.y)) return;
        prec[key(q)] = { p, n };
        coda.push(q);
      });
    }
    if (!(key(a) in prec)) return null;
    const passi = [];
    let p = a;
    while (prec[key(p)]) { passi.unshift(prec[key(p)].n); p = prec[key(p)].p; }
    return passi;
  }

  // ---------- Registro, avvisi, scheda ----------

  function registra(e) {
    const ol = $('registro');
    const li = document.createElement('li');
    li.className = e.tipo || 'info';
    li.textContent = e.testo;
    ol.prepend(li);
    while (ol.children.length > 40) ol.lastChild.remove();
  }
  function avviso(t) {
    registra({ tipo: 'avviso', testo: t });
  }

  function aggiornaScheda() {
    const sc = $('scheda');
    sc.innerHTML = '';
    if (!S) return;
    const h = (tag, txt, cls) => { const el = document.createElement(tag); if (txt != null) el.textContent = txt; if (cls) el.className = cls; return el; };
    if (modo.tipo === 'segnale') {
      sc.append(h('h3', 'Anteprima: ' + E.NOME_SEGNALE[modo.segnale] + ' (costa 1 carica e 1 azione)'));
      const ul = h('ul');
      modo.effetti.forEach((f) => ul.append(h('li', f.testo, f.nullo ? 'nullo' : '')));
      sc.append(ul);
      const box = h('div', null, 'conferma');
      const ok = h('button', 'Conferma (Invio)', 'btn primario piccolo');
      ok.onclick = confermaSegnale;
      const no = h('button', 'Annulla (Esc)', 'btn piccolo');
      no.onclick = () => { modo = { tipo: 'normale' }; aggiorna(); };
      box.append(ok, no);
      sc.append(box);
      return;
    }
    if (modo.tipo === 'selettore') {
      sc.append(h('h3', 'Selettore: quali rami ricevono il segnale?'));
      const box = h('div', null, 'conferma');
      [['entrambi', 'Entrambi'], ['D', 'Solo cortile'], ['E', 'Solo passerella']].forEach(([m, t], i) => {
        const b = h('button', (i + 1) + ' · ' + t, 'btn piccolo' + (S.selettore === m ? ' attivo' : ''));
        b.disabled = S.selettore === m;
        b.onclick = () => esegui({ tipo: 'usa', modo: m });
        box.append(b);
      });
      sc.append(box);
      sc.append(h('p', 'Cambiare posizione costa 1 azione.', 'nullo'));
      return;
    }
    if (modo.tipo === 'esca') {
      sc.append(h('h3', 'Esca: scegli la casella'));
      sc.append(h('p', 'Clicca una casella evidenziata, oppure usa le frecce e conferma con Invio. Il prossimo Richiamare partirà da lì.'));
      return;
    }
    if (modo.tipo === 'percorso') {
      sc.append(h('h3', 'Percorso: ' + modo.passi.length + ' passi'));
      sc.append(h('p', 'Clicca di nuovo la destinazione per partire. Il percorso si ferma se qualcuno ti vede.'));
      return;
    }
    if (modo.tipo === 'aiuto') {
      sc.append(h('h3', 'Suggerimento ' + modo.n + ' di 3'));
      sc.append(h('p', modo.testo));
      if (modo.n < 3) sc.append(h('p', 'Premi di nuovo Suggerimento per un aiuto più diretto.', 'nullo'));
      return;
    }
    if (selezione) {
      const g = S.guardie.find((q) => q.id === selezione);
      if (g) {
        sc.append(h('h3', g.tipo === 'custode' ? 'Custode' : 'Lenticolare'));
        sc.append(h('p', E.descriviGuardia(S, g)));
        sc.append(h('p', g.tipo === 'custode'
          ? 'Vede 3 caselle in linea retta davanti a sé. Se ti vede, colpisce la casella segnata alla fine del turno seguente.'
          : 'Torretta fissa. Cono di 3 caselle: colpisce solo nelle fasi di tiro.', 'nullo'));
        return;
      }
    }
    const ap = anteprimaCache;
    if (ap) {
      const pericoli = ap.eventi.filter((e) => e.tipo === 'danno');
      const vista = ap.eventi.filter((e) => e.tipo === 'rilevato');
      if (pericoli.length) {
        sc.append(h('h3', 'Attenzione'));
        sc.append(h('p', 'Se il turno finisse ora verresti colpita: ' + pericoli.map((e) => e.testo.split(':')[0]).join(', ') + '.'));
        return;
      }
      if (vista.length) {
        sc.append(h('h3', 'Attenzione'));
        sc.append(h('p', 'Se il turno finisse ora, un Custode ti vedrebbe.'));
        return;
      }
    }
    const c = E.cella(S, S.giocatore.x, S.giocatore.y);
    const qui = { R: 'Colonnina di ricarica: Interagisci per riportare le cariche al massimo.', S: 'Selettore della giunzione: Interagisci per scegliere i rami.', K: 'Manovella di servizio: apre il ponte senza cariche.', T: 'Il biglietto di servizio è qui: Interagisci per raccoglierlo.' };
    const t = E.terminaleSotto(S);
    if (t) {
      sc.append(h('h3', 'Terminale'));
      sc.append(h('p', E.terminaleCollegato(S, t) ? 'Da qui puoi emettere un segnale. Scegline uno per vedere chi lo riceve.' : 'Questo terminale non è collegato: serve una Prolunga verso la presa accanto.'));
    } else if (qui[c]) {
      sc.append(h('p', qui[c]));
    }
  }

  // ---------- Aggiornamento HUD ----------

  function pips(el, n, max, cls) {
    el.innerHTML = '';
    for (let i = 0; i < max; i++) {
      const p = document.createElement('span');
      p.className = 'pip ' + (cls || '') + (i < n ? ' pieno' : '');
      el.append(p);
    }
    el.setAttribute('aria-label', n + ' su ' + max);
  }

  function obiettivo() {
    if (!S.flag.pontePassato) return 'Attraversa il ponte verso il deposito';
    if (!S.flag.biglietto) return 'Recupera il biglietto nella cabina del tram';
    return 'Porta il tram al binario d\'uscita, a est';
  }

  function aggiorna() {
    if (!S) return;
    anteprimaCache = S.esito === 'gioco' ? E.anteprimaFase(S) : null;
    $('v-turno').textContent = S.turno;
    pips($('v-azioni'), S.azioni, 2);
    pips($('v-pv'), S.giocatore.pv, S.giocatore.pvMax, 'pv');
    pips($('v-cariche'), S.giocatore.cariche, S.giocatore.caricheMax, 'carica');
    const al = $('v-allarme');
    al.innerHTML = '';
    for (let i = 1; i <= S.allarmeMax; i++) {
      const t = document.createElement('span');
      t.className = 'tacca' + (i <= S.allarme ? ' piena' : '') + (i === 2 || i === 4 ? ' soglia' : '');
      al.append(t);
    }
    al.setAttribute('aria-valuenow', S.allarme);
    al.setAttribute('aria-valuemax', S.allarmeMax);
    al.setAttribute('aria-label', 'Allarme ' + S.allarme + ' su ' + S.allarmeMax);
    $('v-selettore').textContent = { entrambi: 'entrambi i rami', D: 'solo cortile', E: 'solo passerella' }[S.selettore];
    $('obiettivo').textContent = obiettivo();

    const t = E.terminaleSotto(S);
    document.querySelectorAll('[data-segnale]').forEach((b) => {
      b.disabled = !t || S.giocatore.cariche <= 0;
      b.classList.toggle('attivo', modo.tipo === 'segnale' && modo.segnale === b.dataset.segnale);
    });
    document.querySelectorAll('[data-modulo]').forEach((b) => {
      const m = b.dataset.modulo;
      let ok = false;
      if (m === 'prolunga') ok = !!E.varcoVicino(S);
      if (m === 'specchio') ok = E.supportoVicino(S) != null;
      if (m === 'esca') ok = (S.esca.disponibile || !!S.esca.pos) && E.bersagliEsca(S).length > 0;
      b.disabled = !ok;
      b.classList.toggle('attivo', modo.tipo === 'esca' && m === 'esca');
      if (m === 'esca') b.querySelector('span').textContent = S.esca.pos ? 'Esca (posata)' : (S.esca.disponibile ? 'Esca' : 'Esca (consumata)');
      if (m === 'prolunga') b.querySelector('span').textContent = Object.values(S.varchi).some(Boolean) ? 'Prolunga (posata)' : 'Prolunga';
      if (m === 'specchio') b.querySelector('span').textContent = S.specchio != null ? 'Specchio (posato)' : 'Specchio';
    });
    const c = E.cella(S, S.giocatore.x, S.giocatore.y);
    const usa = { R: 'Ricarica', S: 'Selettore', K: 'Manovella', T: 'Raccogli' }[c];
    $('lbl-usa').textContent = usa || 'Interagisci';
    $('btn-usa').disabled = !usa || (c === 'T' && S.flag.biglietto);
    $('btn-annulla').disabled = S.esito !== 'gioco' || (modo.tipo === 'normale' && !pilaAnnulla.length && !(S.assistito && inizioTurni.length >= 2));
    aggiornaScheda();
    disegna();
  }

  // ---------- Disegno ----------

  function ridimensiona() {
    const wrap = $('mappa-wrap');
    const larg = Math.max(200, wrap.clientWidth);
    const alt = Math.max(220, window.innerHeight - 110);
    T = Math.max(12, Math.min(44, Math.floor(Math.min(larg / VISTA.w, alt / VISTA.h))));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(VISTA.w * T * dpr);
    canvas.height = Math.round(VISTA.h * T * dpr);
    canvas.style.width = VISTA.w * T + 'px';
    canvas.style.height = VISTA.h * T + 'px';
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    disegna();
  }

  const px = (x) => (x - VISTA.x0) * T;
  const py = (y) => (y - VISTA.y0) * T;
  const cx = (x) => px(x) + T / 2;
  const cy = (y) => py(y) + T / 2;
  function hash(x, y) { let h = (x * 73856093) ^ (y * 19349663); h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  function rett(x, y, col, a) {
    g2.globalAlpha = a == null ? 1 : a;
    g2.fillStyle = col;
    g2.fillRect(px(x), py(y), T, T);
    g2.globalAlpha = 1;
  }

  function disegnaCasella(x, y, ora) {
    const c = L.def.map[y][x];
    const z = E.zonaDi(S, x, y);
    const X = px(x), Y = py(y);
    if (c === '#' || c === 'm' || c === 'L') {
      g2.fillStyle = '#0a1416';
      g2.fillRect(X, Y, T, T);
      // Facciate: finestre calde sui muri che danno su uno spazio aperto.
      const sotto = y + 1 < L.H ? L.def.map[y + 1][x] : '#';
      if (sotto !== '#' && hash(x, y) > 0.55) {
        g2.fillStyle = COL.finestra;
        g2.globalAlpha = 0.18 + 0.12 * hash(y, x);
        g2.fillRect(X + T * 0.3, Y + T * 0.25, T * 0.4, T * 0.45);
        g2.globalAlpha = 1;
      }
      g2.strokeStyle = 'rgba(31,66,64,0.35)';
      g2.lineWidth = 1;
      g2.strokeRect(X + 0.5, Y + 0.5, T - 1, T - 1);
      return;
    }
    if (c === '~' && !E.portaIn(S, x, y)) {
      g2.fillStyle = '#0f3440';
      g2.fillRect(X, Y, T, T);
      g2.strokeStyle = 'rgba(98,199,216,0.25)';
      g2.lineWidth = 1;
      const off = opz.animRidotte ? 0 : (ora / 900 + x * 0.7 + y) % 1;
      for (let i = 0; i < 2; i++) {
        const yy = Y + T * ((i * 0.5 + off * 0.5) % 1);
        g2.beginPath(); g2.moveTo(X + T * 0.15, yy); g2.quadraticCurveTo(X + T * 0.5, yy - T * 0.1, X + T * 0.85, yy); g2.stroke();
      }
      return;
    }
    g2.fillStyle = PAVIMENTO[z ? z.id : 'D'] || '#242c2a';
    g2.fillRect(X, Y, T, T);
    // Materiale del distretto.
    g2.strokeStyle = 'rgba(236,228,209,0.05)';
    g2.lineWidth = 1;
    if (z && (z.id === 'A' || z.id === 'F')) {
      g2.beginPath(); g2.moveTo(X, Y + T * 0.5); g2.lineTo(X + T, Y + T * 0.5); g2.stroke();
    } else if (z && z.id === 'E') {
      for (let i = 1; i < 4; i++) { g2.beginPath(); g2.moveTo(X + (T * i) / 4, Y); g2.lineTo(X + (T * i) / 4, Y + T); g2.stroke(); }
    } else if (z && z.id === 'C') {
      g2.fillStyle = 'rgba(201,162,74,0.18)';
      [[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]].forEach(([a, b]) => { g2.fillRect(X + T * a - 1, Y + T * b - 1, 2, 2); });
    } else if (z && z.id === 'G') {
      g2.strokeStyle = 'rgba(201,162,74,0.35)';
      g2.beginPath(); g2.moveTo(X, Y + T * 0.3); g2.lineTo(X + T, Y + T * 0.3); g2.moveTo(X, Y + T * 0.7); g2.lineTo(X + T, Y + T * 0.7); g2.stroke();
    } else {
      g2.strokeRect(X + 0.5, Y + 0.5, T - 1, T - 1);
    }
  }

  function linea(a, b, col, largh, tratt) {
    g2.strokeStyle = col;
    g2.lineWidth = largh;
    g2.setLineDash(tratt || []);
    g2.beginPath();
    g2.moveTo(cx(a.x), cy(a.y));
    g2.lineTo(cx(b.x), cy(a.y));
    g2.lineTo(cx(b.x), cy(b.y));
    g2.stroke();
    g2.setLineDash([]);
  }

  function posNodo(id) {
    const n = L.nodi[id];
    return n && n.x != null ? n : null;
  }

  function arcoAttivo(e) {
    return !e.ramo || S.selettore === 'entrambi' || S.selettore === e.ramo;
  }

  function disegnaCavi() {
    L.def.archi.forEach((e) => {
      const a = posNodo(e.a), b = posNodo(e.b);
      if (!a || !b) return;
      const on = arcoAttivo(e);
      linea(a, b, on ? 'rgba(201,162,74,0.55)' : 'rgba(157,177,171,0.22)', on ? Math.max(1.5, T * 0.08) : 1, on ? [] : [3, 4]);
    });
    L.def.varchi.forEach((v) => {
      const a = posNodo(v.a), b = posNodo(v.b);
      if (S.varchi[v.id]) linea(a, b, COL.finestra, Math.max(2, T * 0.12));
      else linea(a, b, 'rgba(242,178,92,0.5)', 1, [2, 3]);
    });
  }

  function testo(t, x, y, col, size, align) {
    g2.fillStyle = col;
    g2.font = '700 ' + Math.round(size) + 'px "Atkinson Hyperlegible", Verdana, sans-serif';
    g2.textAlign = align || 'center';
    g2.textBaseline = 'middle';
    g2.fillText(t, x, y);
  }

  function disegnaOggetti(ora) {
    const lampeggio = opz.lampeggi && !opz.animRidotte ? (Math.floor(ora / 400) % 2 === 0) : true;
    // Porte e ponte.
    L.def.porte.forEach((pd) => {
      const st = S.porte[pd.id];
      pd.caselle.forEach((c) => {
        const X = px(c.x), Y = py(c.y);
        if (pd.tipo === 'ponte') {
          if (st.aperta) {
            g2.fillStyle = '#5a4630';
            g2.fillRect(X, Y + T * 0.1, T, T * 0.8);
            g2.strokeStyle = 'rgba(0,0,0,0.35)';
            for (let i = 1; i < 4; i++) { g2.beginPath(); g2.moveTo(X + (T * i) / 4, Y + T * 0.1); g2.lineTo(X + (T * i) / 4, Y + T * 0.9); g2.stroke(); }
          } else {
            g2.fillStyle = '#0f3440'; g2.fillRect(X, Y, T, T);
            g2.strokeStyle = COL.aprire; g2.lineWidth = 2; g2.setLineDash([3, 3]);
            g2.strokeRect(X + 2, Y + 2, T - 4, T - 4); g2.setLineDash([]);
          }
        } else {
          if (st.aperta) {
            g2.fillStyle = PAVIMENTO.C; g2.fillRect(X, Y, T, T);
            g2.strokeStyle = COL.aprire; g2.lineWidth = 2;
            if (!st.attesaLibera || lampeggio) g2.strokeRect(X + 2, Y + 2, T - 4, T - 4);
          } else {
            g2.fillStyle = '#3a3527'; g2.fillRect(X, Y, T, T);
            g2.strokeStyle = COL.ottone; g2.lineWidth = Math.max(1, T * 0.07);
            for (let i = 1; i < 4; i++) { g2.beginPath(); g2.moveTo(X + (T * i) / 4, Y + 2); g2.lineTo(X + (T * i) / 4, Y + T - 2); g2.stroke(); }
          }
        }
        if (st.aperta) {
          // Contatore di fasi accanto al ricevitore.
          g2.fillStyle = COL.notte; g2.beginPath(); g2.arc(X + T * 0.82, Y + T * 0.18, T * 0.2, 0, 7); g2.fill();
          testo(String(st.cont), X + T * 0.82, Y + T * 0.19, COL.aprire, T * 0.28);
        }
      });
    });
    // Uscita.
    for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
      const c = L.def.map[y][x];
      const X = px(x), Y = py(y);
      if (y < VISTA.y0 || y >= VISTA.y0 + VISTA.h) continue;
      if (c === 'X') {
        g2.fillStyle = S.flag.biglietto ? PAVIMENTO.G : '#3b2321';
        g2.fillRect(X, Y, T, T);
        g2.strokeStyle = S.flag.biglietto ? COL.ottoneChiaro : COL.pericolo;
        g2.lineWidth = 2; g2.strokeRect(X + 2, Y + 2, T - 4, T - 4);
        if (!S.flag.biglietto) testo('×', X + T / 2, Y + T / 2, COL.pericolo, T * 0.6);
      } else if (c === 'R') {
        g2.fillStyle = '#20302c'; g2.beginPath(); g2.arc(X + T / 2, Y + T / 2, T * 0.36, 0, 7); g2.fill();
        g2.strokeStyle = COL.richiamare; g2.lineWidth = 2; g2.stroke();
        testo('⚡', X + T / 2, Y + T / 2 + 1, COL.richiamare, T * 0.42);
      } else if ('123'.includes(c)) {
        g2.fillStyle = '#2a2a20';
        g2.fillRect(X + T * 0.15, Y + T * 0.15, T * 0.7, T * 0.7);
        const t = L.def.nodi.find((n) => n.x === x && n.y === y && n.tipo === 'terminale');
        const coll = t && E.terminaleCollegato(S, t);
        g2.strokeStyle = coll ? COL.ottoneChiaro : COL.nebbia; g2.lineWidth = 2;
        g2.strokeRect(X + T * 0.15, Y + T * 0.15, T * 0.7, T * 0.7);
        testo('T', X + T / 2, Y + T / 2 + 1, coll ? COL.ottoneChiaro : COL.nebbia, T * 0.42);
      } else if (c === 'S') {
        g2.fillStyle = '#2a2a20'; g2.beginPath(); g2.arc(X + T / 2, Y + T / 2, T * 0.38, 0, 7); g2.fill();
        g2.strokeStyle = COL.ottone; g2.lineWidth = 2; g2.stroke();
        const ang = { entrambi: -Math.PI / 2, D: Math.PI / 2, E: -Math.PI / 2 }[S.selettore];
        g2.save(); g2.translate(X + T / 2, Y + T / 2);
        if (S.selettore === 'entrambi') { g2.rotate(0); } else g2.rotate(ang + Math.PI / 2);
        g2.strokeStyle = COL.ottoneChiaro; g2.lineWidth = 2.5;
        g2.beginPath();
        if (S.selettore === 'entrambi') { g2.moveTo(0, -T * 0.28); g2.lineTo(0, T * 0.28); }
        else { g2.moveTo(0, 0); g2.lineTo(0, -T * 0.3); }
        g2.stroke(); g2.restore();
        testo({ entrambi: 'D+E', D: 'D', E: 'E' }[S.selettore], X + T / 2, Y + T * 0.92, COL.ottoneChiaro, T * 0.22);
      } else if (c === 'K') {
        g2.strokeStyle = COL.ottone; g2.lineWidth = 2;
        g2.beginPath(); g2.arc(X + T / 2, Y + T / 2, T * 0.28, 0, 7); g2.stroke();
        g2.beginPath(); g2.moveTo(X + T / 2, Y + T / 2); g2.lineTo(X + T * 0.78, Y + T * 0.3); g2.stroke();
      } else if (c === 'T' && !S.flag.biglietto) {
        const pulse = opz.animRidotte ? 0.5 : 0.5 + 0.5 * Math.sin(ora / 300);
        g2.fillStyle = 'rgba(242,178,92,' + (0.15 + 0.2 * pulse) + ')';
        g2.beginPath(); g2.arc(X + T / 2, Y + T / 2, T * 0.45, 0, 7); g2.fill();
        g2.fillStyle = COL.carta; g2.fillRect(X + T * 0.28, Y + T * 0.36, T * 0.44, T * 0.28);
        g2.fillStyle = COL.pericolo; g2.fillRect(X + T * 0.56, Y + T * 0.36, T * 0.05, T * 0.28);
      } else if (c === 'b') {
        const attivo = S.guardie.some((g) => g.richiamo && g.richiamo.meta.x === x && g.richiamo.meta.y === y);
        g2.strokeStyle = attivo ? COL.richiamare : 'rgba(98,199,216,0.45)'; g2.lineWidth = attivo ? 2.5 : 1.5;
        g2.setLineDash([3, 3]); g2.beginPath(); g2.arc(X + T / 2, Y + T / 2, T * 0.34, 0, 7); g2.stroke(); g2.setLineDash([]);
        testo('≋', X + T / 2, Y + T / 2, attivo ? COL.richiamare : 'rgba(98,199,216,0.6)', T * 0.36);
      } else if (c === 'r') {
        const pend = S.rinforziPendenti.length > 0;
        g2.strokeStyle = pend && lampeggio ? COL.pericolo : 'rgba(238,93,79,0.35)'; g2.lineWidth = 2;
        g2.beginPath(); g2.moveTo(X + 3, Y + 3); g2.lineTo(X + T - 3, Y + T - 3); g2.moveTo(X + T - 3, Y + 3); g2.lineTo(X + 3, Y + T - 3); g2.stroke();
      } else if (c === 'm') {
        const posato = S.specchio != null;
        g2.fillStyle = '#2a2a20'; g2.fillRect(X + T * 0.2, Y + T * 0.55, T * 0.6, T * 0.35);
        g2.strokeStyle = posato ? COL.richiamare : COL.ottone; g2.lineWidth = 2;
        g2.strokeRect(X + T * 0.2, Y + T * 0.55, T * 0.6, T * 0.35);
        if (posato) { g2.beginPath(); g2.moveTo(X + T * 0.25, Y + T * 0.85); g2.lineTo(X + T * 0.75, Y + T * 0.6); g2.stroke(); }
      }
    }
    // Esca posata.
    if (S.esca.pos) {
      const X = px(S.esca.pos.x), Y = py(S.esca.pos.y);
      g2.fillStyle = COL.richiamare; g2.beginPath(); g2.arc(X + T / 2, Y + T / 2, T * 0.16, 0, 7); g2.fill();
      g2.strokeStyle = COL.richiamare; g2.lineWidth = 1.5; g2.beginPath(); g2.arc(X + T / 2, Y + T / 2, T * 0.32, 0, 7); g2.stroke();
    }
    // Tram nella cabina.
    const F = L.def.zone.find((z) => z.id === 'F');
    g2.strokeStyle = 'rgba(201,162,74,0.5)'; g2.lineWidth = 2;
    g2.strokeRect(px(F.x0) + T * 0.5, py(F.y0) + T * 1.4, (F.x1 - F.x0) * T, (F.y1 - F.y0 - 1.8) * T);
    testo('0', px(F.x0) + T * 0.95, py(F.y0) + T * 1.85, 'rgba(201,162,74,0.7)', T * 0.42);
  }

  function disegnaZone() {
    L.def.zone.forEach((z) => {
      if (!S.flag.visteZone.includes(z.id) && z.id !== 'G') return;
      testo(z.nome.toUpperCase(), px(z.x0) + 3, py(z.y0) + T * 0.2, 'rgba(236,228,209,0.35)', Math.max(9, T * 0.26), 'left');
    });
  }

  function disegnaMinacce(ora) {
    const lampeggio = opz.lampeggi && !opz.animRidotte ? (Math.floor(ora / 350) % 2 === 0) : true;
    S.guardie.forEach((g) => {
      if (g.tipo === 'lenticolare') {
        const tiro = g.prossima === 'tiro' && !g.bloccata;
        E.conoLenticolare(S, g).forEach((c) => {
          if (tiro) rett(c.x, c.y, COL.pericolo, 0.32);
          else {
            g2.strokeStyle = 'rgba(238,93,79,0.45)'; g2.lineWidth = 1; g2.setLineDash([3, 3]);
            g2.strokeRect(px(c.x) + 2, py(c.y) + 2, T - 4, T - 4); g2.setLineDash([]);
          }
        });
        return;
      }
      if (g.bloccata) return;
      E.visioneCustode(S, g).forEach((c) => rett(c.x, c.y, COL.vista, selezione === g.id ? 0.32 : 0.18));
      if (g.stato === 'mira' && g.bersaglio) {
        const X = px(g.bersaglio.x), Y = py(g.bersaglio.y);
        g2.strokeStyle = COL.pericolo; g2.lineWidth = 2.5;
        if (lampeggio) g2.strokeRect(X + 2, Y + 2, T - 4, T - 4);
        g2.beginPath(); g2.moveTo(X + T / 2, Y + 4); g2.lineTo(X + T / 2, Y + T - 4); g2.moveTo(X + 4, Y + T / 2); g2.lineTo(X + T - 4, Y + T / 2); g2.stroke();
      }
    });
    // Intenzioni: dove saranno le guardie dopo la fase nemica.
    if (anteprimaCache) {
      anteprimaCache.stato.guardie.forEach((ng) => {
        const g = S.guardie.find((q) => q.id === ng.id);
        if (!g || g.tipo !== 'custode') return;
        if (ng.x !== g.x || ng.y !== g.y) {
          g2.strokeStyle = 'rgba(244,211,107,0.8)'; g2.lineWidth = 2; g2.setLineDash([4, 3]);
          g2.beginPath(); g2.arc(cx(ng.x), cy(ng.y), T * 0.3, 0, 7); g2.stroke(); g2.setLineDash([]);
          freccia(cx(g.x), cy(g.y), cx(ng.x), cy(ng.y), 'rgba(244,211,107,0.8)');
        }
      });
    }
  }

  function freccia(x1, y1, x2, y2, col) {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const r = T * 0.3;
    const sx = x1 + Math.cos(ang) * r, sy = y1 + Math.sin(ang) * r;
    const ex = x2 - Math.cos(ang) * r, ey = y2 - Math.sin(ang) * r;
    g2.strokeStyle = col; g2.lineWidth = 2;
    g2.beginPath(); g2.moveTo(sx, sy); g2.lineTo(ex, ey); g2.stroke();
    g2.beginPath(); g2.moveTo(ex, ey);
    g2.lineTo(ex - Math.cos(ang - 0.5) * T * 0.15, ey - Math.sin(ang - 0.5) * T * 0.15);
    g2.lineTo(ex - Math.cos(ang + 0.5) * T * 0.15, ey - Math.sin(ang + 0.5) * T * 0.15);
    g2.closePath(); g2.fillStyle = col; g2.fill();
  }

  function disegnaGuardie() {
    S.guardie.forEach((g) => {
      const X = cx(g.x), Y = cy(g.y);
      if (g.tipo === 'lenticolare') {
        const tiro = g.prossima === 'tiro' && !g.bloccata;
        g2.fillStyle = '#1b2223'; g2.beginPath(); g2.arc(X, Y, T * 0.42, 0, 7); g2.fill();
        g2.strokeStyle = tiro ? COL.pericolo : COL.nebbia; g2.lineWidth = 3; g2.stroke();
        g2.fillStyle = tiro ? COL.pericolo : COL.nebbia; g2.beginPath(); g2.arc(X, Y, T * 0.16, 0, 7); g2.fill();
        testo(tiro ? 'TIRO' : 'carica', X, Y + T * 0.62, tiro ? COL.pericolo : COL.nebbia, T * 0.24);
      } else {
        g2.fillStyle = '#6f8782'; g2.beginPath(); g2.arc(X, Y, T * 0.36, 0, 7); g2.fill();
        g2.strokeStyle = selezione === g.id ? COL.ottoneChiaro : '#2a3533'; g2.lineWidth = 2; g2.stroke();
        // Direzione dello sguardo.
        g2.fillStyle = COL.vista;
        g2.beginPath();
        g2.moveTo(X + g.dir.x * T * 0.45, Y + g.dir.y * T * 0.45);
        g2.lineTo(X + g.dir.x * T * 0.18 - g.dir.y * T * 0.16, Y + g.dir.y * T * 0.18 - g.dir.x * T * 0.16);
        g2.lineTo(X + g.dir.x * T * 0.18 + g.dir.y * T * 0.16, Y + g.dir.y * T * 0.18 + g.dir.x * T * 0.16);
        g2.closePath(); g2.fill();
        g2.fillStyle = COL.finestra; g2.beginPath(); g2.arc(X, Y, T * 0.09, 0, 7); g2.fill();
      }
      let segno = null, col = COL.carta;
      if (g.bloccata) { segno = '■'; col = COL.fermare; }
      else if (g.stato === 'mira') { segno = '!'; col = COL.pericolo; }
      else if (g.stato === 'cerca') { segno = '?'; col = COL.finestra; }
      else if (g.stato === 'richiamo') { segno = '≋'; col = COL.richiamare; }
      if (segno) {
        g2.fillStyle = COL.notte; g2.beginPath(); g2.arc(X + T * 0.34, Y - T * 0.34, T * 0.2, 0, 7); g2.fill();
        testo(segno, X + T * 0.34, Y - T * 0.33, col, T * 0.3);
      }
      if (g.immune > 0) {
        g2.strokeStyle = COL.fermare; g2.lineWidth = 1.5; g2.setLineDash([2, 2]);
        g2.beginPath(); g2.arc(X, Y, T * 0.46, 0, 7); g2.stroke(); g2.setLineDash([]);
      }
    });
  }

  function disegnaGiocatore() {
    const p = S.giocatore;
    const X = cx(p.x), Y = cy(p.y);
    g2.fillStyle = 'rgba(242,178,92,0.18)'; g2.beginPath(); g2.arc(X, Y, T * 0.5, 0, 7); g2.fill();
    g2.fillStyle = COL.carta; g2.beginPath(); g2.arc(X, Y, T * 0.32, 0, 7); g2.fill();
    g2.strokeStyle = COL.ottone; g2.lineWidth = 3; g2.stroke();
    g2.fillStyle = COL.ottone;
    g2.beginPath(); g2.arc(X + p.dir.x * T * 0.2, Y + p.dir.y * T * 0.2, T * 0.08, 0, 7); g2.fill();
    if (p.carico) { g2.fillStyle = COL.finestra; g2.fillRect(X - T * 0.1, Y - T * 0.52, T * 0.2, T * 0.12); }
  }

  function disegnaModo() {
    if (modo.tipo === 'segnale') {
      const col = COL_SEGNALE[modo.segnale];
      modo.effetti.forEach((f) => {
        (f.caselle || []).forEach((c) => {
          g2.strokeStyle = col; g2.lineWidth = 3; g2.globalAlpha = f.nullo ? 0.4 : 1;
          g2.strokeRect(px(c.x) + 1.5, py(c.y) + 1.5, T - 3, T - 3);
          g2.globalAlpha = 1;
        });
        if (f.meta) {
          g2.strokeStyle = col; g2.lineWidth = 2.5;
          g2.beginPath(); g2.arc(cx(f.meta.x), cy(f.meta.y), T * 0.42, 0, 7); g2.stroke();
        }
      });
    } else if (modo.tipo === 'esca') {
      modo.bersagli.forEach((b, i) => {
        rett(b.x, b.y, COL.richiamare, i === modo.idx ? 0.45 : 0.18);
      });
    } else if (modo.tipo === 'percorso') {
      let p = { x: S.giocatore.x, y: S.giocatore.y };
      g2.fillStyle = COL.ottoneChiaro;
      modo.passi.forEach((n, i) => {
        const d = E.DIRS[n];
        p = { x: p.x + d.x, y: p.y + d.y };
        g2.globalAlpha = i < S.azioni ? 0.9 : 0.45;
        g2.beginPath(); g2.arc(cx(p.x), cy(p.y), T * 0.1, 0, 7); g2.fill();
      });
      g2.globalAlpha = 1;
    }
  }

  function disegnaImpulsi(ora) {
    impulsi = impulsi.filter((im) => ora - im.t0 < 700);
    impulsi.forEach((im) => {
      const k = (ora - im.t0) / 700;
      im.archi.forEach(([a, b]) => {
        const x = cx(a.x) + (cx(b.x) - cx(a.x)) * Math.min(1, k * 2);
        const y = k < 0.5 ? cy(a.y) : cy(a.y) + (cy(b.y) - cy(a.y)) * (k - 0.5) * 2;
        g2.fillStyle = im.col; g2.globalAlpha = 1 - k;
        g2.beginPath(); g2.arc(x, y, T * 0.14, 0, 7); g2.fill();
        g2.globalAlpha = 1;
      });
    });
    lampi = lampi.filter((l) => ora - l.t0 < 900);
    lampi.forEach((l) => {
      g2.strokeStyle = l.col; g2.lineWidth = 3; g2.globalAlpha = 1 - (ora - l.t0) / 900;
      g2.strokeRect(px(l.x) + 1, py(l.y) + 1, T - 2, T - 2);
      g2.globalAlpha = 1;
    });
  }

  function avviaImpulso(nome) {
    const t = S.flag.ultimoTerminale;
    const archi = [];
    L.def.archi.forEach((e) => {
      const a = posNodo(e.a), b = posNodo(e.b);
      if (a && b && arcoAttivo(e)) archi.push([a, b]);
    });
    L.def.varchi.forEach((v) => { if (S.varchi[v.id]) archi.push([posNodo(v.a), posNodo(v.b)]); });
    if (!opz.animRidotte) impulsi.push({ t0: performance.now(), archi, col: COL_SEGNALE[nome] });
    void t;
  }
  function lampo(p, col) { lampi.push({ x: p.x, y: p.y, col, t0: performance.now() }); }

  // Pioggia leggera, disattivata con le animazioni ridotte.
  const gocce = Array.from({ length: 70 }, (_, i) => ({ x: hash(i, 3), y: hash(7, i), v: 0.4 + hash(i, i) * 0.6 }));
  function disegnaPioggia(ora) {
    if (opz.animRidotte) return;
    const w = VISTA.w * T, h = VISTA.h * T;
    g2.strokeStyle = 'rgba(157,177,171,0.16)'; g2.lineWidth = 1;
    g2.beginPath();
    gocce.forEach((d) => {
      const y = ((d.y + (ora / 1000) * d.v) % 1) * h;
      const x = ((d.x + (ora / 4000)) % 1) * w;
      g2.moveTo(x, y); g2.lineTo(x - T * 0.12, y + T * 0.35);
    });
    g2.stroke();
  }

  function disegna() {
    if (!S || $('schermo-gioco').hidden) return;
    const ora = performance.now();
    g2.clearRect(0, 0, VISTA.w * T, VISTA.h * T);
    for (let y = VISTA.y0; y < VISTA.y0 + VISTA.h; y++) for (let x = 0; x < L.W; x++) disegnaCasella(x, y, ora);
    disegnaCavi();
    disegnaOggetti(ora);
    disegnaZone();
    disegnaMinacce(ora);
    disegnaModo();
    disegnaGuardie();
    disegnaGiocatore();
    disegnaImpulsi(ora);
    disegnaPioggia(ora);
  }

  function ciclo() {
    if (!opz.animRidotte || impulsi.length || lampi.length) disegna();
    requestAnimationFrame(ciclo);
  }

  // ---------- Mouse ----------

  function casellaDa(ev) {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor((ev.clientX - r.left) / T) + VISTA.x0;
    const y = Math.floor((ev.clientY - r.top) / T) + VISTA.y0;
    return { x, y };
  }

  function descriviCasella(x, y) {
    const c = E.cella(S, x, y);
    const g = E.guardiaIn(S, x, y);
    if (g) return (g.tipo === 'custode' ? 'Custode. ' : 'Lenticolare. ') + E.descriviGuardia(S, g);
    if (S.giocatore.x === x && S.giocatore.y === y) return 'Nera, conduttrice del tram 0.';
    const porta = E.portaIn(S, x, y);
    if (porta) {
      const pd = L.def.porte.find((p) => p.id === porta);
      const st = S.porte[porta];
      return pd.nome + (st.aperta ? ': aperto, si richiude fra ' + st.cont + ' fasi' + (st.attesaLibera ? ' (occupato)' : '') : ': chiuso. Si apre con Aprire.');
    }
    const testi = {
      R: 'Colonnina di ricarica.', S: 'Selettore della giunzione.', K: 'Manovella di servizio del ponte.',
      T: S.flag.biglietto ? 'Cabina del tram.' : 'Il biglietto di servizio.', X: S.flag.biglietto ? 'Uscita aperta.' : 'Uscita: serve il biglietto.',
      b: 'Faro di richiamo: qui va chi riceve Richiamare dal terminale centrale.', r: 'Ingresso dei rinforzi.',
      m: 'Supporto per lo Specchio: devia il cono della Lenticolare.', '~': 'Acqua del canale.', G: 'Binario d\'uscita.',
    };
    if ('123'.includes(c)) return 'Terminale: da qui si emettono i segnali.';
    if (testi[c]) return testi[c];
    const z = E.zonaDi(S, x, y);
    return z ? z.nome : null;
  }

  canvas.addEventListener('mousemove', (ev) => {
    if (!S) return;
    const c = casellaDa(ev);
    const t = descriviCasella(c.x, c.y);
    const et = $('etichetta-casella');
    if (!t) { et.hidden = true; return; }
    et.textContent = t;
    et.hidden = false;
    const r = canvas.getBoundingClientRect();
    const wr = $('mappa-wrap').getBoundingClientRect();
    let left = ev.clientX - wr.left + 14;
    if (left + 220 > wr.width) left = Math.max(0, ev.clientX - wr.left - 230);
    et.style.left = left + 'px';
    et.style.top = (ev.clientY - wr.top + 14) + 'px';
    void r;
  });
  canvas.addEventListener('mouseleave', () => { $('etichetta-casella').hidden = true; });

  canvas.addEventListener('click', (ev) => {
    if (!S || S.esito !== 'gioco') return;
    AU.avvia();
    const c = casellaDa(ev);
    if (modo.tipo === 'esca') {
      const i = modo.bersagli.findIndex((b) => b.x === c.x && b.y === c.y);
      if (i >= 0) esegui({ tipo: 'modulo', modulo: 'esca', bersaglio: c });
      else { modo = { tipo: 'normale' }; aggiorna(); }
      return;
    }
    const g = E.guardiaIn(S, c.x, c.y);
    if (g) { selezione = selezione === g.id ? null : g.id; modo = { tipo: 'normale' }; aggiorna(); return; }
    selezione = null;
    const p = S.giocatore;
    const d = Math.abs(c.x - p.x) + Math.abs(c.y - p.y);
    if (d === 0) { aggiorna(); return; }
    if (d === 1) {
      const dir = Object.keys(E.DIRS).find((k) => E.DIRS[k].x === c.x - p.x && E.DIRS[k].y === c.y - p.y);
      modo = { tipo: 'normale' };
      esegui({ tipo: 'muovi', dir });
      return;
    }
    if (modo.tipo === 'percorso' && modo.meta.x === c.x && modo.meta.y === c.y) {
      const passi = modo.passi;
      modo = { tipo: 'normale' };
      seguiPercorso(passi);
      return;
    }
    const passi = cercaPercorso(p, c);
    if (passi) { modo = { tipo: 'percorso', passi, meta: c }; aggiorna(); }
    else { modo = { tipo: 'normale' }; aggiorna(); }
  });

  // ---------- Tastiera ----------

  function comandoDaTasto(k) {
    const kl = k.length === 1 ? k.toLowerCase() : k;
    const freccie = { ArrowUp: 'su', ArrowDown: 'giu', ArrowLeft: 'sinistra', ArrowRight: 'destra' };
    if (freccie[k]) return freccie[k];
    if (k === 'Backspace') return 'annulla';
    return Object.keys(opz.tasti).find((c) => opz.tasti[c] === kl) || null;
  }

  document.addEventListener('keydown', (ev) => {
    if (attesaTasto) {
      ev.preventDefault();
      if (ev.key !== 'Escape') {
        const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
        Object.keys(opz.tasti).forEach((c) => { if (opz.tasti[c] === k) opz.tasti[c] = opz.tasti[attesaTasto]; });
        opz.tasti[attesaTasto] = k;
        salvaOpzioni(); applicaOpzioni();
      }
      attesaTasto = null;
      finestraComandi();
      return;
    }
    if (!$('dialogo').hidden) {
      if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Escape') { ev.preventDefault(); avanzaDialogo(); }
      return;
    }
    if (!$('finestra').hidden) {
      if (ev.key === 'Escape' && $('finestra').dataset.chiudibile === '1') { ev.preventDefault(); chiudiFinestra(); }
      return;
    }
    if ($('schermo-gioco').hidden || !S) return;
    if (ev.target && /INPUT|SELECT|TEXTAREA/.test(ev.target.tagName)) return;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      if (modo.tipo !== 'normale' || selezione) { modo = { tipo: 'normale' }; selezione = null; aggiorna(); }
      else finestraMenu();
      return;
    }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      if (modo.tipo === 'segnale') confermaSegnale();
      else if (modo.tipo === 'esca') esegui({ tipo: 'modulo', modulo: 'esca', bersaglio: modo.bersagli[modo.idx] });
      else if (modo.tipo === 'percorso') { const p = modo.passi; modo = { tipo: 'normale' }; seguiPercorso(p); }
      return;
    }
    if (modo.tipo === 'selettore' && ['1', '2', '3'].includes(ev.key)) {
      ev.preventDefault();
      const m = ['entrambi', 'D', 'E'][Number(ev.key) - 1];
      if (m !== S.selettore) esegui({ tipo: 'usa', modo: m });
      return;
    }
    const c = comandoDaTasto(ev.key);
    if (!c) return;
    ev.preventDefault();
    AU.avvia();
    eseguiComando(c);
  });

  function eseguiComando(c) {
    if (c !== 'aiuto' && modo.tipo === 'aiuto') modo = { tipo: 'normale' };
    switch (c) {
      case 'su': case 'giu': case 'sinistra': case 'destra': muovi(c); break;
      case 'aprire': case 'richiamare': case 'fermare': scegliSegnale(c); break;
      case 'prolunga': case 'specchio': case 'esca': usaModulo(c); break;
      case 'usa': interagisci(); break;
      case 'attendi': modo = { tipo: 'normale' }; esegui({ tipo: 'attendi' }); break;
      case 'annulla': annulla(); break;
      case 'aiuto': suggerimento(); break;
      case 'diario': finestraDiario(); break;
    }
  }

  // ---------- Suggerimenti ----------

  function contestoAiuto() {
    const p = S.giocatore;
    const z = E.zonaDi(S, p.x, p.y);
    if (p.cariche === 0 && !S.flag.biglietto) return 'scarico';
    if (S.flag.biglietto) return 'uscita';
    if (!S.flag.pontePassato) return 'inizio';
    if (z && z.id === 'D') return 'cortile';
    if (z && z.id === 'E') return 'passerella';
    if (z && z.id === 'F') return 'cabina';
    return 'giunzione';
  }
  function suggerimento() {
    const ctx = contestoAiuto();
    if (livelloAiuto.ctx !== ctx) livelloAiuto = { ctx, n: 0 };
    livelloAiuto.n = Math.min(3, livelloAiuto.n + 1);
    modo = { tipo: 'aiuto', n: livelloAiuto.n, testo: ST.suggerimenti[ctx][livelloAiuto.n - 1] };
    aggiorna();
  }

  // ---------- Dialoghi ----------

  function dialogo(righe, poi) {
    codaDialogo = codaDialogo.concat(righe);
    if (poi) dopoDialogo = poi;
    if ($('dialogo').hidden) avanzaDialogo();
  }
  function avanzaDialogo() {
    const r = codaDialogo.shift();
    if (!r) {
      $('dialogo').hidden = true;
      const f = dopoDialogo; dopoDialogo = null;
      if (f) f();
      return;
    }
    $('dialogo').hidden = false;
    $('dialogo-chi').textContent = r.chi;
    $('dialogo-testo').textContent = r.testo;
    $('dialogo-avanti').textContent = codaDialogo.length ? 'Avanti' : 'Chiudi';
    $('dialogo-avanti').focus({ preventScroll: true });
  }
  $('dialogo-avanti').onclick = avanzaDialogo;
  $('dialogo').addEventListener('click', (e) => { if (e.target.id === 'dialogo') avanzaDialogo(); });

  // ---------- Finestre ----------

  function finestra(titolo, corpo, azioni, chiudibile) {
    $('finestra-titolo').textContent = titolo;
    const c = $('finestra-corpo');
    c.innerHTML = '';
    corpo.forEach((el) => c.append(typeof el === 'string' ? Object.assign(document.createElement('p'), { textContent: el }) : el));
    const a = $('finestra-azioni');
    a.innerHTML = '';
    azioni.forEach(([t, f, prim]) => {
      const b = document.createElement('button');
      b.className = 'btn' + (prim ? ' primario' : '');
      b.textContent = t;
      b.onclick = f;
      a.append(b);
    });
    $('finestra').dataset.chiudibile = chiudibile ? '1' : '0';
    $('finestra').hidden = false;
    const primo = a.querySelector('button');
    if (primo) primo.focus({ preventScroll: true });
  }
  function chiudiFinestra() { $('finestra').hidden = true; if (S) aggiorna(); }

  function finestraMenu() {
    finestra('Pausa', ['Il gioco aspetta: nessuna azione ha un limite di tempo.'], [
      ['Riprendi', chiudiFinestra, true],
      ['Impostazioni', () => finestraImpostazioni(finestraMenu)],
      ['Comandi', () => finestraComandi(finestraMenu)],
      ['Ricomincia missione', ricominciaMissione],
      ['Torna al titolo', () => { salvaPartita(); chiudiFinestra(); mostraTitolo(); }],
    ], true);
  }

  function campoSpunta(id, etichetta, val, onchange) {
    const l = document.createElement('label');
    l.className = 'campo';
    l.htmlFor = id;
    const s = document.createElement('span'); s.textContent = etichetta;
    const i = document.createElement('input'); i.type = 'checkbox'; i.id = id; i.checked = !!val;
    i.onchange = () => onchange(i.checked);
    l.append(s, i);
    return l;
  }
  function campoScorri(id, etichetta, val, onchange) {
    const l = document.createElement('label');
    l.className = 'campo';
    l.htmlFor = id;
    const s = document.createElement('span'); s.textContent = etichetta;
    const i = document.createElement('input'); i.type = 'range'; i.id = id; i.min = 0; i.max = 1; i.step = 0.05; i.value = val;
    i.oninput = () => onchange(Number(i.value));
    l.append(s, i);
    return l;
  }

  function finestraImpostazioni(indietro) {
    const corpo = [
      campoSpunta('o-testo', 'Testo più grande', opz.testoGrande, (v) => { opz.testoGrande = v; salvaOpzioni(); applicaOpzioni(); ridimensiona(); }),
      campoSpunta('o-anim', 'Animazioni ridotte (niente pioggia e impulsi)', opz.animRidotte, (v) => { opz.animRidotte = v; salvaOpzioni(); }),
      campoSpunta('o-lampi', 'Lampeggi', opz.lampeggi, (v) => { opz.lampeggi = v; salvaOpzioni(); }),
      campoScorri('o-suoni', 'Volume suoni', opz.suoni, (v) => { opz.suoni = v; salvaOpzioni(); AU.avvia(); AU.volumi(opz.suoni, opz.musica); }),
      campoScorri('o-musica', 'Volume musica', opz.musica, (v) => { opz.musica = v; salvaOpzioni(); AU.avvia(); AU.volumi(opz.suoni, opz.musica); AU.musica(v > 0); }),
      campoSpunta('o-assist', 'Modalità assistita (dalla prossima missione): +1 integrità, allarme massimo 4, riavvolgimento del turno', opz.assistito, (v) => { opz.assistito = v; salvaOpzioni(); }),
    ];
    finestra('Impostazioni', corpo, [[indietro ? 'Indietro' : 'Chiudi', indietro || chiudiFinestra, true]], true);
  }

  function finestraComandi(indietro) {
    const g = document.createElement('div');
    g.className = 'tasti';
    Object.keys(NOMI_COMANDI).forEach((c) => {
      const s = document.createElement('span'); s.textContent = NOMI_COMANDI[c];
      const b = document.createElement('button');
      b.className = 'btn piccolo';
      b.textContent = attesaTasto === c ? 'Premi un tasto…' : nomeTasto(opz.tasti[c]);
      b.onclick = () => { attesaTasto = c; finestraComandi(indietro); };
      g.append(s, b);
    });
    const torna = typeof indietro === 'function' ? indietro : null;
    finestra('Comandi', [
      'Frecce o tasti per muoversi, clic su una casella vicina per un passo, clic su una casella lontana per vedere un percorso (secondo clic per partire). Clic su una guardia per vedere cosa guarda. Invio conferma, Esc annulla la scelta.',
      'Clicca un comando per assegnargli un altro tasto.',
      g,
    ], [
      ['Ripristina tasti', () => { opz.tasti = Object.assign({}, TASTI_BASE); salvaOpzioni(); applicaOpzioni(); finestraComandi(indietro); }],
      [torna ? 'Indietro' : 'Chiudi', torna || chiudiFinestra, true],
    ], true);
  }

  function finestraDiario() {
    const voci = S && S.diario.length ? S.diario.map((d) => {
      const el = document.createElement('div');
      el.className = 'diario-voce';
      const p = document.createElement('p'); p.textContent = d.testo;
      const sm = document.createElement('small'); sm.textContent = 'Turno ' + d.turno;
      el.append(p, sm);
      return el;
    }) : ['Ancora nessuna scoperta. Il diario annota i fatti, non le conclusioni.'];
    finestra('Diario', voci, [['Chiudi', chiudiFinestra, true]], true);
  }

  function statistiche() {
    const dl = document.createElement('dl');
    dl.className = 'statistiche';
    const via = [];
    if (S.flag.visteZone.includes('D')) via.push('cortile');
    if (S.flag.visteZone.includes('E')) via.push('passerella');
    [['Turni', S.turno - 1], ['Via', via.join(' e ') || '—'], ['Allarme massimo', (S.flag.allarmePicco || 0) + '/' + S.allarmeMax], ['Colpi subiti', S.flag.danni || 0]].forEach(([k, v]) => {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.append(dt, dd);
    });
    return dl;
  }

  function finestraVittoria() {
    const altra = S.flag.visteZone.includes('D') && S.flag.visteZone.includes('E') ? null
      : 'C\'era anche un\'altra strada: ' + (S.flag.visteZone.includes('D') ? 'la passerella, sopra la giunzione.' : 'il cortile, sotto la giunzione.');
    finestra('Fine del capitolo 1', [
      'Il biglietto senza fermata è sul cruscotto. Il tram 0 ha una passeggera e una destinazione che nessuno sa leggere.',
      statistiche(),
      altra || 'Hai visto entrambe le strade. Bel lavoro di conduttrice.',
      'Il resto della corsa è in lavorazione.',
    ], [
      ['Rigioca il capitolo', () => { chiudiFinestra(); iniziaNuova(); }, true],
      ['Torna al titolo', () => { chiudiFinestra(); mostraTitolo(); }],
    ], false);
  }

  function finestraSconfitta() {
    const istantanee = inizioTurni.slice(0, -1).slice(-3);
    const azioni = [['Riprova dall\'ingresso', ricominciaMissione, true]];
    istantanee.slice().reverse().forEach((st) => {
      azioni.push(['Riprendi dal turno ' + st.turno, () => { S = E.clona(st); inizioTurni = inizioTurni.filter((q) => q.turno <= st.turno); pilaAnnulla = []; chiudiFinestra(); registra({ tipo: 'info', testo: 'Ripreso dal turno ' + st.turno + '.' }); aggiorna(); salvaPartita(); }]);
    });
    finestra('Il tram resta in deposito', [
      'L\'integrità di Nera è finita. Nessuna penalità: puoi ripartire dall\'ingresso con la stessa notte, oppure da uno dei turni recenti.',
      statistiche(),
    ], azioni, false);
  }

  function mostraTitolo() {
    mostraSchermo('schermo-titolo');
    $('btn-continua').hidden = !leggiSalvataggio();
  }

  // ---------- Collegamenti ----------

  document.querySelectorAll('[data-segnale]').forEach((b) => { b.onclick = () => { AU.avvia(); scegliSegnale(b.dataset.segnale); }; });
  document.querySelectorAll('[data-modulo]').forEach((b) => { b.onclick = () => { AU.avvia(); usaModulo(b.dataset.modulo); }; });
  $('btn-usa').onclick = interagisci;
  $('btn-attendi').onclick = () => { modo = { tipo: 'normale' }; esegui({ tipo: 'attendi' }); };
  $('btn-annulla').onclick = annulla;
  $('btn-aiuto').onclick = suggerimento;
  $('btn-diario').onclick = finestraDiario;
  $('btn-menu').onclick = finestraMenu;
  $('btn-nuova').onclick = () => {
    if (leggiSalvataggio()) {
      finestra('Nuova partita', ['C\'è una partita in corso. Iniziarne una nuova la sostituisce.'], [
        ['Inizia da capo', () => { chiudiFinestra(); cancellaSalvataggio(); iniziaNuova(); }, true],
        ['Indietro', chiudiFinestra],
      ], true);
    } else iniziaNuova();
  };
  $('btn-continua').onclick = () => { const d = leggiSalvataggio(); if (d) riprendi(d); };
  $('btn-impostazioni-t').onclick = () => finestraImpostazioni();
  $('btn-comandi-t').onclick = () => finestraComandi();
  $('sottotitolo').textContent = ST.sottotitolo;
  window.addEventListener('resize', () => { if (!$('schermo-gioco').hidden) ridimensiona(); });

  // Pulsanti direzionali per schermi piccoli.
  (function croce() {
    const g = document.createElement('div');
    g.className = 'gruppo croce';
    g.setAttribute('aria-label', 'Movimento');
    [['su', '↑'], ['sinistra', '←'], ['giu', '↓'], ['destra', '→']].forEach(([d, s]) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = s;
      b.setAttribute('aria-label', NOMI_COMANDI[d]);
      b.dataset.dir = d;
      b.onclick = () => { AU.avvia(); muovi(d); };
      g.append(b);
    });
    document.querySelector('.pannello').insertBefore(g, document.querySelector('.pannello .gruppo'));
  })();

  applicaOpzioni();
  mostraTitolo();
  requestAnimationFrame(ciclo);

  // Accesso per i test automatici del browser.
  window.__vespera = { stato: () => S, esegui, iniziaNuova, avanzaDialogo };
})();
