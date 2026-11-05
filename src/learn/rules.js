// How to play: the rules of each game, as this app plays them, and how to get good at it. Written side by side in
// English and Spanish ({ en, es }); keep them matching the engines (dominoes/engine.js, lib/online.js, lib/scoring.js).

const SHARED_SIDES = {
  title: { en: 'Playing with others', es: 'Jugar con otros' },
  points: [
    { en: 'Every person for themselves, or teams of two sitting across from each other when 4, 6 or 8 are playing.', es: 'Cada quien por su cuenta, o equipos de dos sentados frente a frente cuando juegan 4, 6 u 8.' },
    { en: 'Double 6 is the usual set. Double 9 and Double 12 have more tiles for bigger groups.', es: 'El doble 6 es el juego normal. El doble 9 y el doble 12 tienen más fichas para grupos grandes.' },
  ],
};

const lineBasics = {
  en: 'Each tile has two ends with dots. A tile can go on an open end of the line when one of its ends matches: a 6|4 goes on an open 6 or an open 4.',
  es: 'Cada ficha tiene dos lados con puntos. Una ficha va en un extremo abierto de la línea si uno de sus lados coincide: un 6|4 va en un 6 abierto o en un 4 abierto.',
};
const lineFirst = {
  en: 'In the first hand, whoever holds the highest double starts with it (or the heaviest tile, if nobody has a double). After that, whoever won the last hand starts with any tile.',
  es: 'En la primera mano, quien tenga el doble más alto empieza con él (o con la ficha más pesada, si nadie tiene dobles). Después, quien ganó la mano anterior empieza con cualquier ficha.',
};
const lineBlocked = {
  en: 'Blocked: when nobody can play, the hand is over. The player with the fewest dots left wins it, and scores everyone else’s dots minus their own. A tie for fewest scores nothing.',
  es: 'Trancado: cuando nadie puede jugar, se acaba la mano. Gana quien tenga menos puntos en sus fichas, y anota los puntos de los demás menos los suyos. Si empatan, nadie anota.',
};
const heavy = { en: 'Get rid of heavy tiles early. If someone else goes out, every dot in your hand counts for them.', es: 'Sal pronto de las fichas pesadas. Si otro gana, cada punto en tu mano cuenta para él.' };
const variety = { en: 'Keep a mix of numbers. Holding four different numbers gives you four ways to play next turn; holding the same number twice gives you fewer.', es: 'Guarda números variados. Tener cuatro números distintos te da cuatro maneras de jugar en tu próximo turno; repetir el mismo te da menos.' };
const watch = { en: 'Watch what others draw or pass on. If someone couldn’t play on a 3, they have no 3s, so leave a 3 open whenever you can.', es: 'Fíjate cuándo los demás roban o pasan. Si alguien no pudo jugar sobre un 3, no tiene treses, así que deja un 3 abierto siempre que puedas.' };
const doubles = { en: 'Play doubles when you get the chance. A double only matches one number, so it’s the tile most likely to get stuck in your hand.', es: 'Juega tus dobles cuando puedas. Un doble solo coincide con un número, así que es la ficha que más fácil se queda en tu mano.' };
const count = { en: 'Count the tiles. There are 7 of each number in a Double 6 set, so if five 4s are showing and you hold the other two, nobody else can play on a 4.', es: 'Cuenta las fichas. Hay 7 de cada número en un doble 6; si se ven cinco cuatros y tú tienes los otros dos, nadie más puede jugar sobre un 4.' };

export const GAMES = [
  {
    id: 'spades',
    icon: '♠',
    name: { en: 'Spades', es: 'Spades (Picas)' },
    short: { en: 'Four players in two teams. Promise how many books you’ll win, then win them.', es: 'Cuatro jugadores en dos equipos. Promete cuántas bazas vas a ganar, y gánalas.' },
    sections: [
      { title: { en: 'The goal', es: 'El objetivo' }, points: [
        { en: 'Two teams of two, with partners sitting across from each other. The first team to reach the target score wins (usually 500).', es: 'Dos equipos de dos, con los compañeros frente a frente. Gana el primer equipo que llegue al marcador acordado (normalmente 500).' },
        { en: 'Each hand, your team says how many books it will win. Hit that number and you score. Miss it and you lose points.', es: 'En cada mano, tu equipo dice cuántas bazas va a ganar. Si lo logras, anotas. Si no, pierdes puntos.' },
      ] },
      { title: { en: 'The cards', es: 'Las cartas' }, points: [
        { en: 'Everyone gets 13 cards. Ace is high, 2 is low. A book (also called a trick) is one card from each player: four cards.', es: 'Cada quien recibe 13 cartas. El as es la más alta y el 2 la más baja. Una baza es una carta de cada jugador: cuatro cartas.' },
        { en: 'Spades beat every other suit. That’s the whole game: even the 2 of spades beats the ace of hearts.', es: 'Las picas le ganan a todos los demás palos. De eso se trata: hasta el 2 de picas le gana al as de corazones.' },
      ] },
      { title: { en: 'Bidding', es: 'Las apuestas' }, points: [
        { en: 'Starting left of the dealer, each player bids how many books they expect to win, from 1 to 13. Partners’ bids add up to the team’s bid.', es: 'Empezando a la izquierda del que reparte, cada quien apuesta cuántas bazas espera ganar, de 1 a 13. Las apuestas de los compañeros se suman.' },
        { en: 'Nil means you promise to win no books at all. It’s worth 100 points if you do it, and costs 100 if you don’t.', es: 'Nil significa que prometes no ganar ninguna baza. Vale 100 puntos si lo logras, y te cuesta 100 si no.' },
        { en: 'Blind Nil is the same promise made before looking at your cards, for 200 points either way.', es: 'Nil a ciegas es la misma promesa, pero sin mirar tus cartas. Vale 200 puntos a favor o en contra.' },
      ] },
      { title: { en: 'Playing a book', es: 'Cómo se juega una baza' }, points: [
        { en: 'The player left of the dealer leads the first book. Going around, everyone plays one card.', es: 'El jugador a la izquierda del que reparte abre la primera baza. Por turno, cada quien juega una carta.' },
        { en: 'You must follow the suit that was led if you have it. If you don’t, you can play anything, including a spade.', es: 'Tienes que seguir el palo que se abrió si lo tienes. Si no, puedes jugar cualquier carta, incluso una pica.' },
        { en: 'The highest spade wins the book. If there are no spades, the highest card of the suit led wins. The winner leads the next book.', es: 'Gana la pica más alta. Si no hay picas, gana la carta más alta del palo que se abrió. Quien gana abre la siguiente baza.' },
        { en: 'You can’t lead spades until someone has played one on another suit (“spades are broken”), unless spades are all you have.', es: 'No puedes abrir con picas hasta que alguien haya jugado una sobre otro palo (“picas rotas”), salvo que solo tengas picas.' },
      ] },
      { title: { en: 'Scoring', es: 'El marcador' }, points: [
        { en: 'Made your bid: 10 points for each book you bid, plus 1 point for each extra book.', es: 'Lograste tu apuesta: 10 puntos por cada baza apostada, más 1 punto por cada baza extra.' },
        { en: 'Missed your bid (“set”): you lose 10 points for each book you bid.', es: 'No la lograste: pierdes 10 puntos por cada baza apostada.' },
        { en: 'Those extra books are called bags. Every 10 bags costs your team 100 points, so winning too many can hurt.', es: 'Esas bazas extra se llaman bolsas. Cada 10 bolsas le cuestan 100 puntos a tu equipo, así que ganar de más puede salir caro.' },
        { en: 'A team bid of 10 or more earns a 200 point bonus if you make it.', es: 'Una apuesta de equipo de 10 o más gana 200 puntos extra si la logras.' },
        { en: 'Books won by a player who went Nil don’t help their partner’s bid. They count as bags.', es: 'Las bazas que gana quien apostó Nil no ayudan a su compañero. Cuentan como bolsas.' },
      ] },
      { title: { en: 'How to win', es: 'Cómo ganar' }, tips: true, points: [
        { en: 'Bid by counting: an ace is nearly always a book, a king with one more card of its suit is often one, and spades past your third are usually one each.', es: 'Apuesta contando: un as casi siempre es una baza, un rey con otra carta de su palo muchas veces también, y cada pica después de la tercera suele ser una.' },
        { en: 'Don’t waste winners. If your partner is already winning the book, play your lowest card.', es: 'No gastes cartas ganadoras. Si tu compañero ya va ganando la baza, juega tu carta más baja.' },
        { en: 'Playing last? Win with the lowest card that does the job. Can’t win? Throw your lowest.', es: '¿Juegas de último? Gana con la carta más baja que alcance. ¿No puedes ganar? Bota la más baja.' },
        { en: 'Empty a short suit early. Once you’re out of a suit, you can win those books with a small spade.', es: 'Vacía pronto un palo corto. Cuando ya no tengas ese palo, puedes ganar esas bazas con una pica pequeña.' },
        { en: 'Count spades. There are 13. Once the high ones are gone, your medium ones are winners.', es: 'Cuenta las picas. Son 13. Cuando salen las altas, las medianas ganan.' },
        { en: 'Watch the total. Once your team has its books, duck to avoid bags. If the other team is one short, go after them and set them.', es: 'Mira el total. Cuando tu equipo ya tiene sus bazas, evita ganar más para no sumar bolsas. Si al otro equipo le falta una, ve por ellos para que no la logren.' },
        { en: 'If your partner went Nil, protect them: play high on suits they’re likely to win by accident.', es: 'Si tu compañero apostó Nil, protégelo: juega alto en los palos donde podría ganar sin querer.' },
      ] },
    ],
  },
  {
    id: 'draw',
    icon: '🁫',
    name: { en: 'Draw Dominoes', es: 'Robar' },
    short: { en: 'The classic. Can’t play? Draw until you can. First one out scores everyone’s dots.', es: 'El clásico. ¿No puedes jugar? Roba hasta que puedas. El primero en salir anota los puntos de todos.' },
    sections: [
      { title: { en: 'The goal', es: 'El objetivo' }, points: [
        { en: 'Be the first to play all your tiles. You score the dots left in everyone else’s hands. The first to reach the target wins (usually 100).', es: 'Sé el primero en jugar todas tus fichas. Anotas los puntos que quedan en las manos de los demás. Gana el primero en llegar a la meta (normalmente 100).' },
      ] },
      { title: { en: 'Your turn', es: 'Tu turno' }, points: [
        { en: 'In a Double 6 set, with 2 players everyone takes 7 tiles; with 3, 6 tiles; with 4, 5 tiles (or 7, if the host picks it). The rest stay face down in the boneyard.', es: 'En un doble 6, con 2 jugadores cada quien toma 7 fichas; con 3, 6; con 4, 5 (o 7, si el anfitrión lo elige). Las demás quedan boca abajo en el pozo.' },
        lineFirst, lineBasics,
        { en: 'If nothing fits, draw from the boneyard until something does. When the boneyard is empty, you pass: knock on the table.', es: 'Si nada coincide, roba del pozo hasta que algo sirva. Cuando el pozo se acaba, pasas: toca la mesa.' },
      ] },
      { title: { en: 'End of the hand', es: 'El final de la mano' }, points: [
        { en: 'Domino! Play your last tile and you score the dots left in all the other hands.', es: '¡Dominó! Juega tu última ficha y anotas los puntos que quedan en las otras manos.' },
        lineBlocked,
      ] },
      SHARED_SIDES,
      { title: { en: 'How to win', es: 'Cómo ganar' }, tips: true, points: [heavy, variety, doubles, watch, count] },
    ],
  },
  {
    id: 'block',
    icon: '🚫',
    name: { en: 'Block Dominoes', es: 'Bloqueo' },
    short: { en: 'Same line, no drawing. If you can’t play, you pass, so hands get blocked a lot.', es: 'La misma línea, sin robar. Si no puedes jugar, pasas, así que se tranca mucho.' },
    sections: [
      { title: { en: 'The goal', es: 'El objetivo' }, points: [
        { en: 'Be the first to play all your tiles, or have the fewest dots when nobody can play. The first to reach the target wins (usually 100).', es: 'Sé el primero en jugar todas tus fichas, o ten menos puntos cuando nadie pueda jugar. Gana el primero en llegar a la meta (normalmente 100).' },
      ] },
      { title: { en: 'Your turn', es: 'Tu turno' }, points: [
        { en: 'In a Double 6 set, with 2 players everyone takes 7 tiles; with 3, 9 tiles; with 4, 7 tiles.', es: 'En un doble 6, con 2 jugadores cada quien toma 7 fichas; con 3, 9; con 4, 7.' },
        lineFirst, lineBasics,
        { en: 'There’s no drawing. If nothing fits, you pass: knock on the table.', es: 'No se roba. Si nada coincide, pasas: toca la mesa.' },
      ] },
      { title: { en: 'End of the hand', es: 'El final de la mano' }, points: [
        { en: 'Domino! Play your last tile and you score the dots left in all the other hands.', es: '¡Dominó! Juega tu última ficha y anotas los puntos que quedan en las otras manos.' },
        lineBlocked,
      ] },
      SHARED_SIDES,
      { title: { en: 'How to win', es: 'Cómo ganar' }, tips: true, points: [
        heavy, variety, watch, count,
        { en: 'Block on purpose when you’re ahead on dots. If both open ends show a number that’s nearly used up and your hand is light, close the game.', es: 'Tranca a propósito cuando tengas menos puntos. Si los dos extremos muestran un número casi agotado y tu mano pesa poco, cierra el juego.' },
        { en: 'Without a boneyard, every tile is somewhere you can work out: what you can’t see is in someone’s hand.', es: 'Sin pozo, todas las fichas se pueden deducir: lo que no ves está en la mano de alguien.' },
      ] },
    ],
  },
  {
    id: 'allfives',
    icon: '5️⃣',
    name: { en: 'All Fives', es: 'Todos cincos' },
    short: { en: 'Score during the hand whenever the open ends add up to a multiple of 5.', es: 'Anota durante la mano cuando los extremos abiertos sumen un múltiplo de 5.' },
    sections: [
      { title: { en: 'The goal', es: 'El objetivo' }, points: [
        { en: 'Reach the target first (usually 150). You score during the hand as well as at the end.', es: 'Llega primero a la meta (normalmente 150). Anotas durante la mano y también al final.' },
      ] },
      { title: { en: 'Your turn', es: 'Tu turno' }, points: [
        { en: 'It plays like Draw: match an open end, and draw from the boneyard until you can play. When it’s empty, pass.', es: 'Se juega como el de robar: coincide con un extremo abierto, y roba del pozo hasta poder jugar. Cuando se acaba, pasa.' },
        { en: 'If the first tile of the hand is a double, it’s a spinner: once both of its sides have a tile, you can also play off its top and bottom, so there are four ends.', es: 'Si la primera ficha de la mano es un doble, es un “spinner”: cuando sus dos lados tienen ficha, también se puede jugar arriba y abajo, así que hay cuatro extremos.' },
      ] },
      { title: { en: 'Scoring', es: 'El marcador' }, points: [
        { en: 'After you play, add up all the open ends. If the total is a multiple of 5, you score that many points. A double on an end counts both halves.', es: 'Después de jugar, suma todos los extremos abiertos. Si el total es múltiplo de 5, anotas esos puntos. Un doble en un extremo cuenta sus dos lados.' },
        { en: 'Example: the ends show 6 and 4. That’s 10, so you score 10.', es: 'Ejemplo: los extremos muestran 6 y 4. Son 10, así que anotas 10.' },
        { en: 'Go out and you also score the dots left in the other hands, rounded to the nearest 5.', es: 'Si sales, también anotas los puntos en las otras manos, redondeados al 5 más cercano.' },
        lineBlocked,
      ] },
      SHARED_SIDES,
      { title: { en: 'How to win', es: 'Cómo ganar' }, tips: true, points: [
        { en: 'Before each move, add up what the ends would be after each tile. A scoring move usually beats anything else.', es: 'Antes de jugar, suma cómo quedarían los extremos con cada ficha. Una jugada que anota casi siempre es la mejor.' },
        { en: 'Don’t set up the other player. If your move leaves ends that need one easy tile to score big, look for a safer play.', es: 'No le des la jugada al otro. Si tu ficha deja extremos que con una ficha fácil anotan mucho, busca algo más seguro.' },
        { en: 'The 5|0, 6|4 and 5|5 tiles are often worth holding for the right moment: they make tens and fifteens.', es: 'El 5|0, el 6|4 y el 5|5 vale la pena guardarlos para el momento justo: forman dieces y quinces.' },
        { en: 'Open with the 5|5 or the 6|4 if you can: you score the moment you play them.', es: 'Abre con el 5|5 o el 6|4 si puedes: anotas en cuanto los juegas.' },
        heavy,
      ] },
    ],
  },
  {
    id: 'train',
    icon: '🚂',
    name: { en: 'Mexican Train', es: 'Tren mexicano' },
    short: { en: 'Everyone builds their own train. Lowest total after all the rounds wins.', es: 'Cada quien arma su propio tren. Gana el total más bajo después de todas las rondas.' },
    sections: [
      { title: { en: 'The goal', es: 'El objetivo' }, points: [
        { en: 'Have the fewest points after the last round. Each round, try to play all your tiles. Whatever’s left in your hand counts against you, and the 0|0 counts 50.', es: 'Ten menos puntos al final de la última ronda. En cada ronda, intenta jugar todas tus fichas. Lo que quede en tu mano cuenta en tu contra, y el 0|0 cuenta 50.' },
        { en: 'There’s one round per double, starting from the highest (the host can pick fewer rounds). That round’s double goes in the middle.', es: 'Hay una ronda por cada doble, empezando por el más alto (el anfitrión puede elegir menos rondas). El doble de esa ronda va en el centro.' },
      ] },
      { title: { en: 'Your turn', es: 'Tu turno' }, points: [
        { en: 'Everyone has a train that starts at the middle double, and there’s one shared Mexican Train. Each tile has to match the end of the train it’s played on.', es: 'Cada quien tiene un tren que sale del doble del centro, y hay un Tren mexicano para todos. Cada ficha debe coincidir con el final del tren donde se juega.' },
        { en: 'You can play on your own train, the Mexican Train, or the train of anyone who has a marker.', es: 'Puedes jugar en tu tren, en el Tren mexicano, o en el tren de quien tenga marcador.' },
        { en: 'If you can’t play, draw one tile. If it fits, play it. If it doesn’t, you pass and a marker goes on your train: now anyone can play there, until you play on it yourself.', es: 'Si no puedes jugar, roba una ficha. Si sirve, juégala. Si no, pasas y tu tren queda con marcador: cualquiera puede jugar ahí hasta que tú juegues en él.' },
        { en: 'Play a double and you go again, and that double has to be covered before anything else happens. If you can’t cover it, draw; if that doesn’t help, the next player has to try.', es: 'Si juegas un doble, vuelves a jugar, y hay que cubrir ese doble antes que nada. Si no puedes cubrirlo, roba; si no sirve, le toca intentarlo al siguiente.' },
      ] },
      { title: { en: 'End of the round', es: 'El final de la ronda' }, points: [
        { en: 'A round ends when someone plays their last tile, or when nobody can play and there’s nothing left to draw. Everyone adds up what’s in their hand.', es: 'La ronda termina cuando alguien juega su última ficha, o cuando nadie puede jugar y no queda qué robar. Cada quien suma lo que tiene en la mano.' },
      ] },
      SHARED_SIDES,
      { title: { en: 'How to win', es: 'Cómo ganar' }, tips: true, points: [
        { en: 'Plan a long chain for your own train before you start: lay out which tile can follow which, so you use up as many as you can.', es: 'Planea una cadena larga para tu tren antes de empezar: piensa qué ficha sigue a cuál para usar la mayor cantidad posible.' },
        { en: 'Keep your train private. Avoid getting a marker, since then others can dump tiles on it and ruin your plan.', es: 'Cuida tu tren. Evita el marcador, porque los demás pueden botar fichas ahí y dañar tu plan.' },
        { en: 'Use the Mexican Train and other people’s marked trains for tiles that don’t fit your chain.', es: 'Usa el Tren mexicano y los trenes con marcador para las fichas que no le sirven a tu cadena.' },
        { en: 'Only play a double if you can cover it, or the turn may pass with everyone stuck on it, including you.', es: 'Juega un doble solo si puedes cubrirlo; si no, el turno puede pasar con todos atorados, incluido tú.' },
        { en: 'Get rid of heavy tiles, and above all the 0|0: it’s worth 50 against you.', es: 'Sal de las fichas pesadas, y sobre todo del 0|0: vale 50 en tu contra.' },
      ] },
    ],
  },
  {
    id: 'foot',
    icon: '🐔',
    name: { en: 'Chicken Foot', es: 'Pata de gallo' },
    short: { en: 'Doubles sprout three new lines that must be filled first. Lowest total wins.', es: 'Los dobles abren tres líneas nuevas que hay que llenar primero. Gana el total más bajo.' },
    sections: [
      { title: { en: 'The goal', es: 'El objetivo' }, points: [
        { en: 'Have the fewest points after the last round. Whatever’s left in your hand counts against you, and the 0|0 counts 50.', es: 'Ten menos puntos al final de la última ronda. Lo que quede en tu mano cuenta en tu contra, y el 0|0 cuenta 50.' },
        { en: 'There’s one round per double, starting from the highest (the host can pick fewer rounds). That round’s double goes in the middle.', es: 'Hay una ronda por cada doble, empezando por el más alto (el anfitrión puede elegir menos rondas). El doble de esa ronda va en el centro.' },
      ] },
      { title: { en: 'Your turn', es: 'Tu turno' }, points: [
        { en: 'First, six tiles have to go around the middle double. Nobody can play anywhere else until all six are down.', es: 'Primero, seis fichas tienen que ir alrededor del doble del centro. Nadie juega en otro lado hasta que estén las seis.' },
        { en: 'After that, play on the end of any line, as long as the numbers match.', es: 'Después, juega al final de cualquier línea, siempre que los números coincidan.' },
        { en: 'Play a double and it makes a chicken foot: that line ends, and three new tiles have to go on the double before anyone plays anywhere else.', es: 'Si juegas un doble, se forma una pata de gallo: esa línea termina, y hay que poner tres fichas nuevas en el doble antes de jugar en otro lado.' },
        { en: 'If you can’t play, draw one tile. If it fits, play it. If it doesn’t, you pass.', es: 'Si no puedes jugar, roba una ficha. Si sirve, juégala. Si no, pasas.' },
      ] },
      { title: { en: 'End of the round', es: 'El final de la ronda' }, points: [
        { en: 'A round ends when someone plays their last tile, or when nobody can play and there’s nothing left to draw. Everyone adds up what’s in their hand.', es: 'La ronda termina cuando alguien juega su última ficha, o cuando nadie puede jugar y no queda qué robar. Cada quien suma lo que tiene en la mano.' },
      ] },
      SHARED_SIDES,
      { title: { en: 'How to win', es: 'Cómo ganar' }, tips: true, points: [
        { en: 'A double can trap everyone. Play one when you hold two or more tiles of that number and others probably don’t.', es: 'Un doble puede atrapar a todos. Juégalo cuando tengas dos o más fichas de ese número y los demás probablemente no.' },
        { en: 'Watch what’s been played. If most of a number is gone, a double of it will force others to draw.', es: 'Fíjate qué se ha jugado. Si casi todo un número ya salió, un doble de ese número obligará a los demás a robar.' },
        { en: 'Get rid of heavy tiles, and above all the 0|0: it’s worth 50 against you.', es: 'Sal de las fichas pesadas, y sobre todo del 0|0: vale 50 en tu contra.' },
        { en: 'Keep a mix of numbers, because you never know which end you’ll be forced onto.', es: 'Guarda números variados, porque nunca sabes en qué extremo te tocará jugar.' },
      ] },
    ],
  },
];
export const gameById = (id) => GAMES.find((g) => g.id === id);
