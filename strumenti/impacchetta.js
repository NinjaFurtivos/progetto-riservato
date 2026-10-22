// Crea due versioni in un solo file:
//  dist/gioco.html     pagina autonoma da aprire con doppio clic
//  dist/artifact.html  stesso gioco senza intestazione del documento, per la pubblicazione
const fs = require('fs');
const path = require('path');

const radice = path.join(__dirname, '..');
const leggi = (p) => fs.readFileSync(path.join(radice, p), 'utf8');
const html = leggi('index.html');

const css = leggi('src/style.css');
const script = ['src/engine.js', 'src/level1.js', 'src/storia.js', 'src/audio.js', 'src/ui.js']
  .map((f) => '<script>\n' + leggi(f).replace(/<\/script/gi, '<\\/script') + '\n</script>')
  .join('\n');

let autonoma = html
  .replace('<link rel="stylesheet" href="src/style.css">', () => '<style>\n' + css + '\n</style>')
  .replace(/<script src="src\/[^"]+"><\/script>\n?/g, '');
autonoma = autonoma.replace('</body>', () => script + '\n</body>');

const titolo = html.match(/<title>.*?<\/title>/)[0];
const font = html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];
const corpo = html.slice(html.indexOf('<!--CORPO-->') + 12, html.indexOf('<!--/CORPO-->'));
const artifact = [
  titolo,
  '<meta name="claude:viewport-fit-sides" content="cover">',
  font,
  '<style>\n' + css + '\n</style>',
  corpo.trim(),
  script,
].join('\n');

fs.mkdirSync(path.join(radice, 'dist'), { recursive: true });
fs.writeFileSync(path.join(radice, 'dist/gioco.html'), autonoma);
fs.writeFileSync(path.join(radice, 'dist/artifact.html'), artifact);
console.log('dist/gioco.html', autonoma.length, 'byte');
console.log('dist/artifact.html', artifact.length, 'byte');
