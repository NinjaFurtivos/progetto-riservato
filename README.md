# Progetto riservato

Un gioco a sorpresa. Questa pagina non svela niente: titolo, storia e regole si scoprono giocando.

> Se vuoi la sorpresa intatta, non aprire le cartelle `src/` e `tests/`: contengono testi e mappe.

## Come si gioca

Il modo più semplice: scarica `dist/gioco.html` e aprilo con doppio clic nel browser (Chrome, Edge, Firefox o Safari recenti). Non serve installare niente e non serve internet, a parte i caratteri tipografici che, se manca la rete, vengono sostituiti da quelli di sistema.

In alternativa apri `index.html` dalla cartella del progetto.

- Giocatore singolo, a turni, nessun limite di tempo.
- Si gioca con mouse e tastiera; i tasti si cambiano da **Impostazioni → Comandi**.
- Il salvataggio è automatico a ogni turno, nel browser che usi.
- In **Impostazioni** trovi testo più grande, animazioni ridotte, lampeggi disattivabili, volumi separati per suoni e musica e una modalità assistita.

## Stato

Prima versione giocabile: il primo capitolo, completo dall'inizio alla fine. Il resto è in lavorazione.

## Per chi sviluppa

```bash
npm test          # prove automatiche delle regole e dei percorsi (Node 18 o più recente)
npm run build     # rigenera dist/gioco.html dopo aver modificato i sorgenti
```

Le regole stanno in `src/engine.js` e sono separate dalla grafica (`src/ui.js`): l'anteprima mostrata al giocatore usa le stesse funzioni della risoluzione, su una copia dello stato.
