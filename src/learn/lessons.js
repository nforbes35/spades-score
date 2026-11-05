// What the coach says in a practice game: the opening lessons, and the ones it gives the first time something happens.
const l = (en, es) => ({ en, es });

const LINE_START = [
  l('Let’s play! You’re against the computer, and I’m your coach. I can see your tiles, not the computer’s.', '¡A jugar! Juegas contra la computadora, y yo soy tu entrenador. Veo tus fichas, no las de la computadora.'),
  l('Your tiles are at the bottom. A tile can go on an open end when one of its numbers matches. A 6|4 goes on an open 6 or an open 4.', 'Tus fichas están abajo. Una ficha va en un extremo abierto si uno de sus números coincide. Un 6|4 va en un 6 abierto o en un 4 abierto.'),
];
const LOW_START = [
  l('Let’s play! You’re against the computer, and I’m your coach. I can see your tiles, not the computer’s.', '¡A jugar! Juegas contra la computadora, y yo soy tu entrenador. Veo tus fichas, no las de la computadora.'),
];

export const OPENING = {
  draw: [...LINE_START, l('The goal: play all your tiles first. If you can’t play, you draw from the boneyard. You score whatever dots the computer is left holding.', 'El objetivo: juega todas tus fichas primero. Si no puedes jugar, robas del pozo. Anotas los puntos que le queden a la computadora.')],
  block: [...LINE_START, l('The goal: play all your tiles first. There’s no drawing here: if you can’t play, you pass. If nobody can play, the fewest dots wins.', 'El objetivo: juega todas tus fichas primero. Aquí no se roba: si no puedes jugar, pasas. Si nadie puede jugar, gana quien tenga menos puntos.')],
  allfives: [...LINE_START, l('The twist: after every tile, add up the open ends. If they make 5, 10, 15 or 20, whoever played it scores that many points.', 'El truco: después de cada ficha, suma los extremos abiertos. Si dan 5, 10, 15 o 20, quien la jugó anota esos puntos.')],
  train: [...LOW_START,
    l('Each row is a train that starts from the middle double. You can play on your train or the shared Mexican Train. Tiles have to match the end of the train.', 'Cada fila es un tren que sale del doble del centro. Puedes jugar en tu tren o en el Tren mexicano. La ficha debe coincidir con el final del tren.'),
    l('The goal: finish with the fewest dots. If you can’t play, you draw one tile. Still stuck? You pass, and a marker lets anyone play on your train.', 'El objetivo: termina con menos puntos. Si no puedes jugar, robas una ficha. ¿Sigues sin poder? Pasas, y un marcador deja que cualquiera juegue en tu tren.')],
  foot: [...LOW_START,
    l('Six tiles have to go around the middle double first. After that, you can play on the end of any line.', 'Primero, seis fichas tienen que ir alrededor del doble del centro. Después puedes jugar al final de cualquier línea.'),
    l('Play a double and it grows a chicken foot: three tiles must go on it before anyone plays elsewhere. Finish with the fewest dots to win.', 'Si juegas un doble, sale una pata de gallo: hay que ponerle tres fichas antes de jugar en otro lado. Gana quien termine con menos puntos.')],
  spades: [
    l('Let’s play! You and your partner across the table are a team against the two on your sides. They’re all computer players, and I’m your coach.', '¡A jugar! Tú y tu compañero de enfrente son un equipo contra los dos de los lados. Todos son la computadora, y yo soy tu entrenador.'),
    l('Each book is one card from each player. You must follow the suit that was led if you can, and the highest card wins. Ace is highest.', 'Cada baza es una carta de cada jugador. Debes seguir el palo que se abrió si puedes, y gana la carta más alta. El as es la más alta.'),
    l('But spades beat everything. If you’re out of the suit that was led, even a small spade wins the book.', 'Pero las picas le ganan a todo. Si no tienes el palo que se abrió, hasta una pica pequeña gana la baza.'),
  ],
};

export const MOMENTS = {
  double: l('A double just went down. Doubles are hard to place, so it’s good to be rid of them.', 'Acaba de salir un doble. Los dobles son difíciles de colocar, así que conviene salir de ellos.'),
  draw: l('Nothing of yours fits, so you draw. Each tile you pick up is more dots in your hand, so playing well early saves you later.', 'Nada tuyo sirve, así que robas. Cada ficha que tomas son más puntos en tu mano; jugar bien al principio te ayuda después.'),
  pass: l('Nothing fits and you can’t draw. Knock on the table to pass: that’s how players show they’re stuck.', 'Nada sirve y no puedes robar. Toca la mesa para pasar: así se avisa que estás atorado.'),
  botDraw: l('The computer had to draw. That tells you something: it had none of those open numbers. Try to leave them open.', 'La computadora tuvo que robar. Eso te dice algo: no tenía esos números abiertos. Trata de dejarlos así.'),
  botPass: l('The computer passed. It has none of those open numbers. Keep them open and it stays stuck!', 'La computadora pasó. No tiene esos números abiertos. ¡Déjalos abiertos y seguirá atorada!'),
  fives: l('Points! The open ends just added up to a multiple of 5. Always add up the ends before you play.', '¡Puntos! Los extremos abiertos sumaron un múltiplo de 5. Siempre suma los extremos antes de jugar.'),
  coverDouble: l('A double was played, so it has to be covered before anything else. Whoever played it goes again.', 'Se jugó un doble, así que hay que cubrirlo antes que nada. Quien lo jugó vuelve a jugar.'),
  marker: l('You have a marker on your train now, so the computer can play on it too. Play on your own train to take it off.', 'Ahora tu tren tiene marcador, así que la computadora también puede jugar ahí. Juega en tu propio tren para quitarlo.'),
  foot: l('A chicken foot! Three tiles must go on that double before anyone plays anywhere else.', '¡Una pata de gallo! Hay que poner tres fichas en ese doble antes de jugar en otro lado.'),
  bid: l('Time to bid: how many books will you win? Count your aces, your kings with a backup card, and your spades past the third. Don’t forget, your partner bids too.', 'Hora de apostar: ¿cuántas bazas vas a ganar? Cuenta tus ases, tus reyes con otra carta de su palo, y tus picas después de la tercera. Recuerda que tu compañero también apuesta.'),
  botNil: l('Someone bid Nil: they’re trying to win no books at all. If you can make them win one, they lose 100 points.', 'Alguien apostó Nil: quiere no ganar ninguna baza. Si logras que gane una, pierde 100 puntos.'),
  tapCard: l('To play a card, tap it and press Play, or just swipe it up. I’ll raise the card I’d pick when you tap Show me.', 'Para jugar una carta, tócala y presiona Jugar, o deslízala hacia arriba. Levantaré la que yo elegiría cuando toques Muéstrame.'),
  lead: l('It’s your lead, so you pick the suit. Remember, spades can’t be led until they’re broken.', 'Te toca abrir, así que tú eliges el palo. Recuerda: no se abre con picas hasta que estén rotas.'),
  broken: l('Spades are broken! Someone played a spade on another suit, so spades can be led now.', '¡Picas rotas! Alguien jugó una pica sobre otro palo, así que ya se puede abrir con picas.'),
  void: l('You’re out of that suit, so you can play anything. A spade will win this book, unless someone plays a higher one.', 'Ya no tienes ese palo, así que puedes jugar cualquier carta. Una pica gana esta baza, salvo que alguien juegue una más alta.'),
  madeBid: l('Your team has its books! From here on, each extra book is a bag, and 10 bags cost 100 points. Try not to win more than you need.', '¡Tu equipo ya tiene sus bazas! De aquí en adelante, cada baza extra es una bolsa, y 10 bolsas cuestan 100 puntos. Trata de no ganar de más.'),
  setThem: l('The other team still needs books and few are left. If they miss their bid, they lose points, so go after them!', 'Al otro equipo todavía le faltan bazas y quedan pocas. Si no logran su apuesta, pierden puntos, ¡así que ve por ellos!'),
};
