/** Pequeño libro de nombres de aperturas (en español) por secuencia SAN. */
const BOOK = [
  ['e4', 'Apertura de peón de rey'],
  ['d4', 'Apertura de peón de dama'],
  ['c4', 'Apertura Inglesa'],
  ['Nf3', 'Apertura Réti'],
  ['e4 e5', 'Partida abierta'],
  ['e4 c5', 'Defensa Siciliana'],
  ['e4 e6', 'Defensa Francesa'],
  ['e4 c6', 'Defensa Caro-Kann'],
  ['e4 d5', 'Defensa Escandinava'],
  ['e4 d6', 'Defensa Pirc'],
  ['e4 Nf6', 'Defensa Alekhine'],
  ['e4 g6', 'Defensa Moderna'],
  ['e4 e5 f4', 'Gambito de Rey'],
  ['e4 e5 Nf3 Nc6 Bb5', 'Apertura Española (Ruy López)'],
  ['e4 e5 Nf3 Nc6 Bc4', 'Apertura Italiana'],
  ['e4 e5 Nf3 Nc6 Bc4 Bc5', 'Giuoco Piano'],
  ['e4 e5 Nf3 Nc6 Bc4 Nf6', 'Defensa de los Dos Caballos'],
  ['e4 e5 Nf3 Nc6 d4', 'Apertura Escocesa'],
  ['e4 e5 Nf3 Nf6', 'Defensa Petrov'],
  ['e4 e5 Nf3 d6', 'Defensa Philidor'],
  ['e4 e5 Nc3', 'Apertura Vienesa'],
  ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6', 'Siciliana Najdorf'],
  ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6', 'Siciliana Dragón'],
  ['e4 c5 c3', 'Siciliana Alapin'],
  ['d4 d5 c4', 'Gambito de Dama'],
  ['d4 d5 c4 dxc4', 'Gambito de Dama Aceptado'],
  ['d4 d5 c4 e6', 'Gambito de Dama Rehusado'],
  ['d4 d5 c4 c6', 'Defensa Eslava'],
  ['d4 Nf6 c4 g6', 'Defensa India de Rey'],
  ['d4 Nf6 c4 e6 Nc3 Bb4', 'Defensa Nimzoindia'],
  ['d4 Nf6 c4 e6 Nf3 b6', 'Defensa India de Dama'],
  ['d4 Nf6 c4 g6 Nc3 d5', 'Defensa Grünfeld'],
  ['d4 Nf6 c4 c5', 'Defensa Benoni'],
  ['d4 f5', 'Defensa Holandesa'],
  ['d4 d5 Bf4', 'Sistema Londres'],
  ['d4 Nf6 Bf4', 'Sistema Londres'],
  ['d4 d5 Nf3 Nf6 Bf4', 'Sistema Londres'],
  ['f3 e5 g4 Qh4#', 'Mate del Loco'],
  ['e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#', 'Mate del Pastor'],
  ['e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#', 'Mate del Pastor'],
];
const MAP = new Map(BOOK.map(([s, n]) => [s, n]));

export function openingName(sanList) {
  let name = '';
  for (let i = 1; i <= Math.min(sanList.length, 12); i++) {
    const n = MAP.get(sanList.slice(0, i).join(' '));
    if (n) name = n;
  }
  return name;
}
