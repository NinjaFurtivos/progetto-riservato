// Suoni sintetizzati con Web Audio: nessun file esterno.
// Ogni suono ha un equivalente visivo nell'interfaccia.
(function (root) {
  'use strict';

  let ctx = null;
  let master = null, busSuoni = null, busMusica = null;
  let musicaTimer = null;
  const opz = { suoni: 0.6, musica: 0.3 };

  function avvia() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch (e) { ctx = null; return; }
    master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
    busSuoni = ctx.createGain(); busSuoni.gain.value = opz.suoni; busSuoni.connect(master);
    busMusica = ctx.createGain(); busMusica.gain.value = opz.musica; busMusica.connect(master);
  }

  function volumi(suoni, musica) {
    opz.suoni = suoni; opz.musica = musica;
    if (busSuoni) busSuoni.gain.value = suoni;
    if (busMusica) busMusica.gain.value = musica;
  }

  function tono(freq, dur, tipo, vol, bus, quando) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (quando || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = tipo || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(bus || busSuoni);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function rumore(dur, vol, filtro) {
    if (!ctx) return;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = filtro || 900;
    const g = ctx.createGain(); g.gain.value = vol || 0.15;
    src.connect(f); f.connect(g); g.connect(busSuoni);
    src.start();
  }

  // Tre timbri distinti per i tre segnali.
  const SUONI = {
    passo: () => rumore(0.06, 0.12, 1400),
    aprire: () => { tono(392, 0.5, 'triangle', 0.25); tono(587, 0.6, 'triangle', 0.18, null, 0.08); },
    richiamare: () => { [0, 0.12, 0.24].forEach((q, i) => tono(660 - i * 60, 0.25, 'sine', 0.2, null, q)); },
    fermare: () => { tono(110, 0.35, 'square', 0.12); tono(82, 0.4, 'square', 0.08, null, 0.05); },
    leva: () => { rumore(0.12, 0.2, 500); tono(220, 0.1, 'square', 0.06); },
    danno: () => { tono(140, 0.4, 'sawtooth', 0.2); rumore(0.2, 0.2, 300); },
    allarme: () => { tono(880, 0.15, 'square', 0.08); tono(880, 0.15, 'square', 0.08, null, 0.25); },
    biglietto: () => { [523, 659, 784].forEach((f, i) => tono(f, 0.4, 'triangle', 0.16, null, i * 0.1)); },
    turno: () => tono(196, 0.15, 'sine', 0.07),
    errore: () => tono(160, 0.12, 'square', 0.06),
    vittoria: () => { [392, 494, 587, 784].forEach((f, i) => tono(f, 0.8, 'triangle', 0.15, null, i * 0.18)); },
  };

  function suona(nome) {
    if (!ctx || !SUONI[nome]) return;
    try { SUONI[nome](); } catch (e) { /* audio non essenziale */ }
  }

  // Accompagnamento lento: un giro di quattro accordi, molto basso.
  const GIRO = [[220, 262, 330], [196, 247, 294], [175, 220, 262], [196, 247, 330]];
  function musica(attiva) {
    if (musicaTimer) { clearInterval(musicaTimer); musicaTimer = null; }
    if (!attiva || !ctx) return;
    let i = 0;
    const suonaAccordo = () => {
      GIRO[i % GIRO.length].forEach((f, k) => tono(f / 2, 3.8, 'sine', 0.05, busMusica, k * 0.4));
      i++;
    };
    suonaAccordo();
    musicaTimer = setInterval(suonaAccordo, 4000);
  }

  root.Audio2 = { avvia, suona, musica, volumi };
})(this);
