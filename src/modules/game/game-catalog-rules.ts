import type { LanguageField } from './schemas/game.schema';

const loc = (
  en: string,
  es: string,
  fr = en,
  de = en,
  it = en,
  pt = en,
): LanguageField => ({ en, es, fr, de, it, pt });

/**
 * Play4Cash catalog rules — derived from `*-game.logic.ts`, gateways, and room/catalog config.
 * Synced to Mongo on API boot (`GameService.ensureCatalogRules`).
 */
export const GAME_CATALOG_RULES: Record<string, LanguageField[]> = {
  chess: [
    loc(
      '2 players on a standard 8×8 board. Checkmate wins; stalemate is a draw.',
      '2 jugadores en tablero 8×8 estándar. Jaque mate gana; tablas por ahogado.',
    ),
    loc(
      'Each move must be played before the room turn timer (see catalog / lobby).',
      'Cada jugada debe jugarse antes del temporizador de la sala (catálogo / lobby).',
    ),
    loc(
      'Pawn promotion (queen, rook, bishop, knight), castling, and en passant are supported.',
      'Hay promoción de peón (dama, torre, alfil, caballo), enroque y en passant.',
    ),
    loc(
      'If your turn timer expires, you lose and your opponent wins the stake.',
      'Si expira tu temporizador, pierdes y el rival gana la apuesta.',
    ),
    loc(
      'Disconnecting after the match started may forfeit after the reconnection grace window.',
      'Desconectarte tras iniciada la partida puede implicar forfeit tras la ventana de reconexión.',
    ),
  ],

  halma: [
    loc(
      '2 players on an 8×8 board; pieces move only on dark squares, diagonally.',
      '2 jugadores en tablero 8×8; las fichas solo se mueven en casillas oscuras, en diagonal.',
    ),
    loc(
      'Each player starts with 12 pieces in the first three rows on their side.',
      'Cada jugador empieza con 12 fichas en las tres filas iniciales de su bando.',
    ),
    loc(
      'Normal piece: one diagonal step, or a jump over exactly one piece (distance 2). Reaching the opposite end row crowns a king.',
      'Ficha normal: un paso diagonal, o salto sobre una ficha (distancia 2). Al llegar al extremo opuesto se corona rey.',
    ),
    loc(
      'King: any diagonal distance with a clear path; flying jump over exactly one piece, landing anywhere behind it.',
      'Rey: cualquier distancia diagonal con camino libre; salto volador sobre una ficha, aterrizando detrás de ella.',
    ),
    loc(
      'Jumps mark opponent pieces for capture; captured pieces are removed when you end your turn (Send move).',
      'Los saltos marcan fichas rivales para captura; se eliminan al terminar tu turno (Enviar jugada).',
    ),
    loc(
      'While further jumps are possible you must continue with the same piece; otherwise confirm Send move to pass the turn.',
      'Mientras haya saltos posibles debes seguir con la misma ficha; si no, confirma Enviar jugada para ceder el turno.',
    ),
    loc(
      'Win by eliminating all opponent pieces. Draw if both players are left with a single king each. Timeout or forfeit awards the win to the opponent.',
      'Gana quien elimine todas las fichas rivales. Tablas si ambos quedan con un solo rey. Timeout o forfeit entrega la victoria al rival.',
    ),
  ],

  domino: [
    loc(
      'Double-6 domino: rooms for 2 to 4 players; 7 tiles each; undistributed tiles go to the boneyard. Highest double opens; if none, highest pip sum opens.',
      'Dominó doble-6: salas de 2 a 4 jugadores; 7 fichas cada uno; las fichas no repartidas van al pozo. Abre el doble más alto; si no hay, la suma de puntos más alta.',
    ),
    loc(
      'On your turn, play a tile matching an open end of the chain, or draw one tile from the boneyard — you keep the turn after drawing.',
      'En tu turno, juega una ficha que coincida con un extremo de la cadena, o roba una del pozo — conservas el turno tras robar.',
    ),
    loc(
      'If the boneyard is empty and you have no legal tile, pass.',
      'Si el pozo está vacío y no tienes jugada legal, pasa.',
    ),
    loc(
      'The round ends when someone empties their hand, or every active player passes in a row (blocked game).',
      'La ronda termina cuando alguien se queda sin fichas, o todos los activos pasan seguidos (juego bloqueado).',
    ),
    loc(
      'Blocked game: lowest pip total in hand wins; equal lowest totals is a draw.',
      'Juego bloqueado: gana quien tenga menos puntos en la mano; empate de mínimos es tablas.',
    ),
    loc(
      'Turn timer expiry or forfeit permanently eliminates you; your tiles return to the boneyard. If only one active player remains, they win.',
      'Timeout o forfeit te elimina; tus fichas vuelven al pozo. Si solo queda un jugador activo, gana.',
    ),
  ],

  uno: [
    loc(
      'Classic UNO for 2-10 players. The match ends when a player reaches the catalog match point target (shown in lobby).',
      'UNO clásico para 2-10 jugadores. El match termina al alcanzar el objetivo de puntos del catálogo (lobby).',
    ),
    loc(
      'Multiple rounds: the round winner scores the pip value of every other active player\'s remaining cards.',
      'Varias rondas: el ganador de la ronda suma el valor en puntos de las cartas restantes de los demás jugadores activos.',
    ),
    loc(
      'On your turn: play a card matching color, number, or symbol on the discard pile; respond to a pending +2/+4 stack; draw one card; or take the entire draw stack.',
      'En tu turno: juega carta que coincida en color, número o símbolo; responde a una pila +2/+4; roba una carta; o toma toda la pila de robo.',
    ),
    loc(
      '+2 stacking: only another +2 while the top discard is +2. Wild +4 adds 4 and can stack on +2 or +4; you cannot play Wild +4 if you still hold the current color.',
      'Apilar +2: solo otro +2 mientras arriba haya +2. +4 comodín suma 4 y puede apilarse sobre +2 o +4; no puedes jugar +4 si aún tienes el color activo.',
    ),
    loc(
      'Declare UNO at one card. Rivals can challenge a missed call for a 2-card penalty before the next play, draw, or stack action.',
      'Declara UNO con una carta. Los rivales pueden retar un olvido con penalización de 2 cartas antes de la siguiente jugada, robo o pila.',
    ),
    loc(
      'Skip, Reverse, and Draw Two use standard UNO effects. With 2 players, Reverse lets you play again.',
      'Salta, Reversa y +2 aplican efectos UNO estándar. Con 2 jugadores, Reversa te deja jugar de nuevo.',
    ),
    loc(
      'Timeout or forfeit eliminates you for the current round only; the match continues with the next deal until the point target is reached.',
      'Timeout o forfeit te elimina solo en la ronda actual; el match sigue con el siguiente reparto hasta el objetivo de puntos.',
    ),
  ],

  'connect-four': [
    loc(
      '2 players on a 6×7 board. You play red or yellow according to your seat.',
      '2 jugadores en tablero 6×7. Juegas rojo o amarillo según tu asiento.',
    ),
    loc(
      'Alternate dropping one disc into any column that is not full; discs fall to the lowest empty cell.',
      'Alternad turnos soltando un disco en cualquier columna libre; cae en la celda vacía más baja.',
    ),
    loc(
      'Connect four of your discs in a row — horizontal, vertical, or diagonal — to win the stake.',
      'Conecta cuatro discos en línea — horizontal, vertical o diagonal — para ganar la apuesta.',
    ),
    loc(
      'If the board fills with no winner, it is a draw: both players are refunded their stake (no commission on draws).',
      'Si el tablero se llena sin ganador, hay empate: se reintegra la apuesta a ambos (sin comisión en tablas).',
    ),
    loc(
      'Turn timer expiry or voluntary forfeit awards the win to your opponent.',
      'Timeout del turno o forfeit voluntario entrega la victoria al rival.',
    ),
  ],

  'naval-battle': [
    loc(
      '2 players; each has a hidden 10×10 grid.',
      '2 jugadores; cada uno tiene una cuadrícula oculta de 10×10.',
    ),
    loc(
      'Placement phase: place all five ships — Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2) — without overlap or leaving the grid.',
      'Fase de colocación: coloca los cinco barcos — Portaaviones (5), Acorazado (4), Crucero (3), Submarino (3), Destructor (2) — sin solaparse ni salir del tablero.',
    ),
    loc(
      'When both fleets are placed, battle begins. Take turns firing at one cell on the enemy grid.',
      'Cuando ambas flotas están colocadas, comienza la batalla. Por turnos dispara a una celda del tablero enemigo.',
    ),
    loc(
      'Sink every cell of all enemy ships to win the match and the stake.',
      'Hunde todas las celdas de cada barco enemigo para ganar la partida y la apuesta.',
    ),
    loc(
      'Turn timer from the catalog applies during battle. Timeout or disconnect may forfeit after the reconnection grace window.',
      'En batalla aplica el temporizador del catálogo. Timeout o desconexión puede implicar forfeit tras la ventana de reconexión.',
    ),
  ],

  battleship: [
    loc(
      '2 players; each has a hidden 10×10 grid.',
      '2 jugadores; cada uno tiene una cuadrícula oculta de 10×10.',
    ),
    loc(
      'Placement phase: place all five ships — Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2) — without overlap or leaving the grid.',
      'Fase de colocación: coloca los cinco barcos — Portaaviones (5), Acorazado (4), Crucero (3), Submarino (3), Destructor (2) — sin solaparse ni salir del tablero.',
    ),
    loc(
      'When both fleets are placed, battle begins. Take turns firing at one cell on the enemy grid.',
      'Cuando ambas flotas están colocadas, comienza la batalla. Por turnos dispara a una celda del tablero enemigo.',
    ),
    loc(
      'Sink every cell of all enemy ships to win the match and the stake.',
      'Hunde todas las celdas de cada barco enemigo para ganar la partida y la apuesta.',
    ),
    loc(
      'Turn timer from the catalog applies during battle. Timeout or disconnect may forfeit after the reconnection grace window.',
      'En batalla aplica el temporizador del catálogo. Timeout o desconexión puede implicar forfeit tras la ventana de reconexión.',
    ),
  ],
};
