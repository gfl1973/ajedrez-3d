/**
 * Modo Torneo: «Circuito de Campeones». Seis rivales de dificultad creciente.
 * Victoria = pasas de ronda (+1). Tablas = +½ y repites ronda.
 * Derrota = pierdes una vida y repites ronda. Con 0 vidas quedas eliminado.
 */
import { load, save, remove, loadRaw } from './storage.js';

export const RIVALS = [
  { name: 'Paco «el Peón»', level: 1, elo: 800, initials: 'PP', city: 'Albacete', quote: 'Yo muevo rápido; ya pensaré después.' },
  { name: 'Lucía Enroque', level: 2, elo: 1100, initials: 'LE', city: 'Valladolid', quote: 'Primero el rey a salvo, luego hablamos.' },
  { name: 'Don Bernardo Alfil', level: 3, elo: 1400, initials: 'BA', city: 'Salamanca', quote: 'La gran diagonal es mi casa.' },
  { name: 'Carmen «la Torre» Vidal', level: 4, elo: 1700, initials: 'CV', city: 'Bilbao', quote: 'Las columnas abiertas no perdonan.' },
  { name: 'Íñigo Gambito', level: 5, elo: 2000, initials: 'IG', city: 'Sevilla', quote: 'Te regalo un peón… o eso crees.' },
  { name: 'Doña Elvira, la Dama de Hierro', level: 6, elo: 2300, initials: 'DE', city: 'Toledo', quote: 'Nadie ha cruzado mi tablero dos veces.' },
];

const LIVES = 3;

export class Tournament {
  constructor(data) { Object.assign(this, data); }

  static current() {
    const d = loadRaw('tournament');
    return d && d.active ? new Tournament(d) : null;
  }

  static records() { return load('records', { bestRound: 0, titles: 0, games: 0 }); }

  static start(tc = null) {
    const t = new Tournament({ active: true, round: 0, lives: LIVES, points: 0, attempts: 0, wins: 0, draws: 0, losses: 0, tc, history: [], startedAt: Date.now(), status: 'playing' });
    t.save();
    return t;
  }

  save() { save('tournament', { ...this }); }
  abandon() { remove('tournament'); }
  get rival() { return RIVALS[this.round]; }
  /** Color del jugador: alterna en cada partida jugada. */
  get humanColor() { return (this.round + this.attempts) % 2 === 0 ? 'w' : 'b'; }

  /** result: 'win' | 'draw' | 'loss'. Devuelve el resultado del torneo. */
  record(result) {
    const rec = Tournament.records();
    rec.games++;
    this.history.push({ round: this.round, rival: this.rival.name, result, color: this.humanColor, at: Date.now() });
    let outcome = 'continue';
    if (result === 'win') {
      this.points += 1; this.wins++; this.attempts = 0;
      this.round++;
      rec.bestRound = Math.max(rec.bestRound, this.round);
      if (this.round >= RIVALS.length) { outcome = 'champion'; this.status = 'champion'; this.active = false; rec.titles++; }
      else outcome = 'advance';
    } else if (result === 'draw') {
      this.points += 0.5; this.draws++; this.attempts++;
      outcome = 'replay';
    } else {
      this.losses++; this.lives--; this.attempts++;
      if (this.lives <= 0) { outcome = 'eliminated'; this.status = 'eliminated'; this.active = false; }
      else outcome = 'replay';
    }
    save('records', rec);
    if (this.active) this.save(); else { save('tournament', { ...this }); }
    return outcome;
  }
}
