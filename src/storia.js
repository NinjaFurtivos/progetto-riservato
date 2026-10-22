// Testi del capitolo 1: scene, messaggi radio e suggerimenti.
(function (root) {
  'use strict';

  const STORIA = {
    titolo: 'L\'ultima corsa di Vespera',
    sottotitolo: 'Capitolo 1 · Il biglietto senza fermata',

    apertura: [
      { chi: '', testo: 'Vespera, notte. Pioviggina sui ponti. Le campane dell\'Organo Civico hanno appena suonato la chiusura.' },
      { chi: 'Lio', testo: 'Hanno requisito il tram. Per eccesso di fermate.' },
      { chi: 'Nera', testo: 'Ne abbiamo quattro.' },
      { chi: 'Lio', testo: 'Tre, da stamattina.' },
      { chi: 'Lio', testo: 'Il tram 0 è nel deposito, oltre il ponte. Senza il biglietto di servizio non lascia il binario.' },
      { chi: 'Nera', testo: 'Allora prendo il biglietto. E già che ci sono, anche il tram.' },
      { chi: 'Lio', testo: 'Ti ho caricato il trasmettitore: tre cariche. Aprire, Richiamare, Fermare. La città obbedisce ai segnali, ma solo dove arrivano i cavi.' },
    ],

    guida: [
      'Ogni turno hai 2 azioni: un passo, un segnale, una leva o un modulo costano 1 azione ciascuno. Osservare è gratis.',
      'Quando finisci le azioni, la città si muove: guardie, porte e torrette fanno esattamente quello che vedi nell\'anteprima.',
      'Sali su un terminale e scegli un segnale: prima di confermare vedi chi lo riceve e cosa succede.',
    ],

    radio: {
      C: [
        { chi: 'Lio', testo: 'Sei alla giunzione. Il selettore smista il segnale fra due rami.' },
        { chi: 'Lio', testo: 'Sotto c\'è il cortile, con un Custode di ronda. Sopra la passerella, sorvegliata da una Lenticolare. Tutte e due portano alla cabina.' },
        { chi: 'Nera', testo: 'Tocca una guardia e vedo cosa guarda. Il resto lo decido io.' },
      ],
      F: [
        { chi: '', testo: 'Il tram 0 è dove lo hanno lasciato. Sul cruscotto, sotto la polvere, c\'è un vecchio simbolo di manutenzione: una chiave dentro un cerchio.' },
        { chi: 'Nera', testo: 'Ciao, vecchio mio. Dov\'è il tuo biglietto?' },
      ],
      biglietto: [
        { chi: 'Nera', testo: 'Obliterato a regola d\'arte, timbro valido. E il nome della fermata grattato via con un temperino.' },
        { chi: 'Lio', testo: 'Valido per dove, allora?' },
        { chi: 'Nera', testo: 'Per uscire di qui, intanto. Il binario d\'uscita è a est.' },
      ],
      scarico: [
        { chi: 'Lio', testo: 'Il trasmettitore è a secco. La colonnina in rimessa lo ricarica gratis. Il ponte ha una manovella di servizio sul lato est.' },
      ],
    },

    chiusura: [
      { chi: '', testo: 'Il tram 0 scivola fuori dal deposito. Le ruote cantano sugli scambi bagnati.' },
      { chi: '', testo: 'La radio di bordo gracchia. Una voce chiama una fermata che non compare su nessuna mappa.' },
      { chi: 'Nera', testo: 'Lio, hai sentito anche tu?' },
      { chi: '', testo: 'Nera si volta. Sul sedile in fondo c\'è un\'anziana con una scatola sulle ginocchia. Dentro, qualcosa tintinna: maniglie di ottone.' },
      { chi: 'Nera', testo: 'Signora, questo è un mezzo di servizio. Come è salita?' },
      { chi: 'Passeggera', testo: 'Con il biglietto, cara.' },
      { chi: 'Passeggera', testo: 'Non mi serve una fermata nuova. Mi basta che vi ricordiate dov\'era quella vecchia.' },
    ],

    // Suggerimenti in tre livelli: cosa osservare, relazione utile, prossima azione.
    suggerimenti: {
      inizio: [
        'Osserva il ponte sull\'acqua: un cavo lo collega al terminale lì accanto.',
        'Il segnale Aprire apre i ponti e le porte collegati per 2 fasi nemiche.',
        'Sali sul terminale a nord del ponte, emetti Aprire e attraversa entro due turni.',
      ],
      giunzione: [
        'Due strade portano alla cabina: il cortile in basso e la passerella in alto. Tocca le guardie per vedere dove guardano.',
        'Il selettore decide quali rami ricevono il segnale del terminale centrale. Richiamare sposta il Custode verso il faro segnato nel cortile.',
        'Cortile: Richiamare e poi Aprire, passa alle spalle del Custode. Passerella: selettore su passerella, Aprire, poi attraversa il cono quando la Lenticolare è in carica.',
      ],
      cortile: [
        'Il Custode vede tre caselle davanti a sé, in linea retta. Ai lati e alle spalle non vede.',
        'Mentre segue un richiamo guarda verso il faro: tienilo alle spalle.',
        'Costeggia il muro nord del cortile e prosegui a est verso la cabina.',
      ],
      passerella: [
        'La Lenticolare alterna carica e tiro. In fase di carica il cono è innocuo.',
        'Termina il turno fuori dal cono quando la prossima fase è un tiro. Lo Specchio sul supporto devia il cono verso il muro.',
        'Fermati prima del cono, attendi un tiro, poi attraversalo durante la carica e scendi la scala.',
      ],
      cabina: [
        'Il biglietto è nella cabina del tram.',
        'Raccogliere il biglietto costa un\'azione e sblocca l\'uscita.',
        'Mettiti sulla casella del biglietto e usa Interagisci.',
      ],
      uscita: [
        'Il binario d\'uscita è a est della cabina.',
        'Con il biglietto la porta d\'uscita si apre.',
        'Raggiungi il binario d\'uscita a est.',
      ],
      scarico: [
        'Il trasmettitore è scarico.',
        'La colonnina in rimessa ricarica le cariche gratis, al costo di un\'azione.',
        'Torna in rimessa: la manovella sul lato est del ponte lo apre senza cariche.',
      ],
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = STORIA;
  else root.STORIA = STORIA;
})(this);
