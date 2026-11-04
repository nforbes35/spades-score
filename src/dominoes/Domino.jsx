// A domino tile drawn as SVG: two halves with pips for 0–12 (double-12 sets), each number in its own colour
// like a real coloured-pip set. `a`/`b` are the halves (top/left first); `vertical` stands it up.

// Pip spots on a half that is 1 × 1, as [x, y] (0–1). Up to 9 use a 3 × 3 grid, 10–12 a 3 × 4 grid.
const G3 = [0.22, 0.5, 0.78];
const G4 = [0.17, 0.39, 0.61, 0.83];
const at3 = (c, r) => [G3[c], G3[r]];
const at4 = (c, r) => [G3[c], G4[r]];
const PIPS = [
  [],
  [at3(1, 1)],
  [at3(0, 0), at3(2, 2)],
  [at3(0, 0), at3(1, 1), at3(2, 2)],
  [at3(0, 0), at3(2, 0), at3(0, 2), at3(2, 2)],
  [at3(0, 0), at3(2, 0), at3(1, 1), at3(0, 2), at3(2, 2)],
  [at3(0, 0), at3(2, 0), at3(0, 1), at3(2, 1), at3(0, 2), at3(2, 2)],
  [at3(0, 0), at3(2, 0), at3(0, 1), at3(1, 1), at3(2, 1), at3(0, 2), at3(2, 2)],
  [at3(0, 0), at3(1, 0), at3(2, 0), at3(0, 1), at3(2, 1), at3(0, 2), at3(1, 2), at3(2, 2)],
  [at3(0, 0), at3(1, 0), at3(2, 0), at3(0, 1), at3(1, 1), at3(2, 1), at3(0, 2), at3(1, 2), at3(2, 2)],
  [at4(0, 0), at4(2, 0), at4(0, 1), at4(1, 1), at4(2, 1), at4(0, 2), at4(1, 2), at4(2, 2), at4(0, 3), at4(2, 3)],
  [at4(0, 0), at4(1, 0), at4(2, 0), at4(0, 1), at4(1, 1), at4(2, 1), at4(0, 2), at4(2, 2), at4(0, 3), at4(1, 3), at4(2, 3)],
  [at4(0, 0), at4(1, 0), at4(2, 0), at4(0, 1), at4(1, 1), at4(2, 1), at4(0, 2), at4(1, 2), at4(2, 2), at4(0, 3), at4(1, 3), at4(2, 3)],
];
// Pip colours by number (as on coloured double-12 sets)
const COLORS = ['#000', '#2a8fd6', '#2f9e44', '#d6336c', '#8a5a2b', '#1c3faa', '#d49b00', '#7b3fbf', '#0b7a5e', '#c2410c', '#1f2937', '#db2777', '#4b5563'];

function Half({ n, x, y, colored }) {
  const pipR = n > 9 ? 0.085 : 0.1;
  return (
    <g transform={`translate(${x} ${y})`}>
      {(PIPS[n] ?? []).map(([px, py], i) => (
        <circle key={i} cx={px} cy={py} r={pipR} fill={colored ? COLORS[n] : '#141414'} />
      ))}
    </g>
  );
}

/** One domino. size = its long side in px. */
export default function Domino({ a, b, vertical = false, size = 80, colored = true, faceDown = false, className = '', style, ...rest }) {
  const w = vertical ? 1 : 2, h = vertical ? 2 : 1;
  const long = size, short = size / 2;
  return (
    <svg className={`domino${faceDown ? ' face-down' : ''} ${className}`} width={vertical ? short : long} height={vertical ? long : short}
      viewBox={`-0.04 -0.04 ${w + 0.08} ${h + 0.08}`} role="img" aria-label={faceDown ? 'Domino, face down' : `Domino ${a}–${b}`} style={style} {...rest}>
      <rect x="0" y="0" width={w} height={h} rx="0.13" className="domino-body" />
      {faceDown ? (
        <circle cx={w / 2} cy={h / 2} r="0.12" className="domino-spinner" />
      ) : (
        <>
          {vertical
            ? <line x1="0.12" y1="1" x2="0.88" y2="1" className="domino-bar" />
            : <line x1="1" y1="0.12" x2="1" y2="0.88" className="domino-bar" />}
          <circle cx={w / 2} cy={h / 2} r="0.05" className="domino-spinner" />
          <Half n={a} x={0} y={0} colored={colored} />
          <Half n={b} x={vertical ? 0 : 1} y={vertical ? 1 : 0} colored={colored} />
        </>
      )}
    </svg>
  );
}
