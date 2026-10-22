// Capitolo 1 — dati della mappa. Coordinate (x, y) con origine in alto a sinistra.
(function (root) {
  'use strict';

  // Legenda caselle:
  //  #  muro            .  pavimento        ~  acqua          =  ponte (ricevitore)
  //  g  cancello D      e  porta E          X  uscita (si apre col biglietto)
  //  R  colonnina       1 2 3  terminali    S  selettore      K  manovella del ponte
  //  T  biglietto       m  supporto specchio (non percorribile)
  //  L  lenticolare     G  zona d'uscita    @  partenza       b  punto di richiamo
  //  r  ingresso rinforzi
  const MAP = [
    '############################',
    '############################',
    '################m###########',
    '##############........######',
    '##############........L#####',
    '##############..3.....######',
    '#....#..~..###e#####.#######',
    '#.R..#.1~K.#.....###....####',
    '#.@.....=....S2..###....#GG#',
    '#....#..~..#.....###..T.XGG#',
    '#....#..~..###g#####....#GG#',
    '############.......#....####',
    '############b...........####',
    '############......r#########',
    '############################',
    '############################',
  ];

  const LEVEL = {
    id: 'cap1',
    titolo: 'Capitolo 1',
    map: MAP,
    zone: [
      { id: 'A', nome: 'Rimessa', x0: 1, y0: 6, x1: 4, y1: 10, sicura: true },
      { id: 'B', nome: 'Ponte', x0: 6, y0: 6, x1: 10, y1: 10 },
      { id: 'C', nome: 'Giunzione', x0: 12, y0: 7, x1: 16, y1: 9 },
      { id: 'D', nome: 'Cortile', x0: 12, y0: 11, x1: 18, y1: 13 },
      { id: 'E', nome: 'Passerella', x0: 14, y0: 3, x1: 21, y1: 5 },
      { id: 'F', nome: 'Cabina', x0: 20, y0: 7, x1: 23, y1: 12 },
      { id: 'G', nome: 'Binario d\'uscita', x0: 25, y0: 8, x1: 26, y1: 10, sicura: true },
    ],
    // Nodi del circuito. I ricevitori indicano il bersaglio.
    nodi: [
      { id: 'TB', tipo: 'terminale', x: 7, y: 7, faro: { x: 7, y: 7 } },
      { id: 'PONTE', tipo: 'porta', porta: 'ponte', x: 8, y: 8 },
      { id: 'TC', tipo: 'terminale', x: 14, y: 8, faro: { x: 12, y: 12 } },
      { id: 'SEL', tipo: 'giunzione', x: 13, y: 8 },
      { id: 'GD', tipo: 'porta', porta: 'cancelloD', x: 14, y: 10 },
      { id: 'ANT1', tipo: 'antenna', guardia: 'custode1', x: 16, y: 10 },
      { id: 'LEN', tipo: 'antenna', guardia: 'lenticolare1', x: 22, y: 4 },
      { id: 'PE', tipo: 'porta', porta: 'portaE', x: 14, y: 6 },
      { id: 'PRESA', tipo: 'presa', x: 16, y: 6 },
      { id: 'T3', tipo: 'terminale', x: 16, y: 5, faro: { x: 16, y: 5 } },
    ],
    // Archi bidirezionali. "ramo" indica il controllo del selettore.
    archi: [
      { a: 'TB', b: 'PONTE' },
      { a: 'TC', b: 'SEL' },
      { a: 'SEL', b: 'GD', ramo: 'D' },
      { a: 'GD', b: 'ANT1' },
      { a: 'SEL', b: 'LEN', ramo: 'E' },
      { a: 'LEN', b: 'PE' },
      { a: 'PE', b: 'PRESA' },
    ],
    // Interruzioni colmabili con la Prolunga: { terminale, presa }.
    varchi: [{ id: 'V1', a: 'T3', b: 'PRESA' }],
    porte: [
      { id: 'ponte', tipo: 'ponte', caselle: [{ x: 8, y: 8 }], nome: 'Ponte' },
      { id: 'cancelloD', tipo: 'porta', caselle: [{ x: 14, y: 10 }], nome: 'Cancello del cortile' },
      { id: 'portaE', tipo: 'porta', caselle: [{ x: 14, y: 6 }], nome: 'Porta della passerella' },
    ],
    manovelle: [{ x: 9, y: 7, porta: 'ponte' }],
    guardie: [
      {
        id: 'custode1', tipo: 'custode', x: 16, y: 12,
        ronda: [{ x: 16, y: 11 }, { x: 16, y: 12 }, { x: 16, y: 13 }],
        rondaIdx: 1, dirRonda: 1,
      },
      { id: 'lenticolare1', tipo: 'lenticolare', x: 22, y: 4, dir: { x: -1, y: 0 }, prossima: 'tiro' },
    ],
    supportiSpecchio: [{ x: 16, y: 2, torretta: 'lenticolare1', dir: { x: 0, y: -1 } }],
    rinforzi: [
      { x: 18, y: 13, ronda: [{ x: 18, y: 13 }, { x: 17, y: 13 }] },
    ],
    moduliIniziali: ['prolunga', 'specchio', 'esca'],
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = LEVEL;
  else root.LEVEL1 = LEVEL;
})(this);
