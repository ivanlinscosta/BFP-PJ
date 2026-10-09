import { useMemo } from 'react';

/** Small deterministic PRNG so the illustration is identical on every render. */
function mulberry(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Segment {
  d: string;
  width: number;
}

interface Tip {
  x: number;
  y: number;
}

function grow(
  rand: () => number,
  x: number,
  y: number,
  angle: number,
  length: number,
  depth: number,
  direction: 1 | -1,
  segments: Segment[],
  tips: Tip[],
) {
  const bend = (rand() - 0.5) * 0.6;
  const endX = x + Math.cos(angle) * length;
  const endY = y + Math.sin(angle) * length * direction;
  const controlX = x + Math.cos(angle + bend) * length * 0.55;
  const controlY = y + Math.sin(angle + bend) * length * 0.55 * direction;
  segments.push({
    d: `M${x.toFixed(1)} ${y.toFixed(1)} Q${controlX.toFixed(1)} ${controlY.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}`,
    width: Math.max(0.6, depth * 0.55),
  });
  if (depth <= 1) {
    tips.push({ x: endX, y: endY });
    return;
  }
  const children = depth > 3 ? 2 : rand() < 0.75 ? 2 : 3;
  for (let index = 0; index < children; index += 1) {
    const spread = (index - (children - 1) / 2) * (0.5 + rand() * 0.25);
    grow(
      rand,
      endX,
      endY,
      angle + spread,
      length * (0.68 + rand() * 0.12),
      depth - 1,
      direction,
      segments,
      tips,
    );
  }
}

/**
 * DNA tree: a metaphor of the customer (roots = relationship, branches = products and digital,
 * sprouts = commercial intent). It is decorative; the values are in the annotations.
 */
export function DnaTree({ highlightIntent = true }: { highlightIntent?: boolean }) {
  const { crown, roots, crownTips, rootTips, strands } = useMemo(() => {
    const rand = mulberry(42);
    const crownSegments: Segment[] = [];
    const crownTips: Tip[] = [];
    const rootSegments: Segment[] = [];
    const rootTips: Tip[] = [];
    // Crown: main limbs leave the top of the trunk in a fan.
    for (const angle of [-2.55, -2.2, -1.85, -1.57, -1.29, -0.94, -0.6]) {
      grow(rand, 160, 112, angle, 34 + rand() * 8, 5, 1, crownSegments, crownTips);
    }
    // Roots: shorter, wider fan below the base.
    for (const angle of [2.75, 2.35, 1.95, 1.57, 1.2, 0.8, 0.4]) {
      grow(rand, 160, 205, angle, 20 + rand() * 6, 4, 1, rootSegments, rootTips);
    }
    // Trunk: three strands twisting around each other (the "double helix").
    const strands = [0, 1, 2].map((offset) => {
      const points: string[] = [];
      for (let step = 0; step <= 24; step += 1) {
        const t = step / 24;
        const y = 205 - t * 93;
        const x = 160 + Math.sin(t * Math.PI * 3 + (offset * Math.PI * 2) / 3) * (7 - t * 2.5);
        points.push(`${step === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
      }
      return points.join(' ');
    });
    return { crown: crownSegments, roots: rootSegments, crownTips, rootTips, strands };
  }, []);

  // Sprouts of opportunity: the right-hand tips of the crown, highlighted in orange.
  const sprouts = highlightIntent
    ? crownTips.filter((tip) => tip.x > 205 && tip.y < 70).slice(0, 3)
    : [];

  return (
    <svg
      aria-hidden
      className="h-full w-full"
      fill="none"
      preserveAspectRatio="xMidYMid meet"
      viewBox="0 0 320 260"
    >
      <g stroke="var(--color-brand-navy)" strokeLinecap="round">
        {roots.map((segment, index) => (
          <path d={segment.d} key={`r${index}`} opacity={0.85} strokeWidth={segment.width} />
        ))}
        {strands.map((d, index) => (
          <path d={d} key={`s${index}`} strokeWidth={3.2} />
        ))}
        {crown.map((segment, index) => (
          <path d={segment.d} key={`c${index}`} opacity={0.9} strokeWidth={segment.width} />
        ))}
      </g>
      <g fill="var(--color-brand-navy)">
        {crownTips.map((tip, index) => (
          <circle cx={tip.x} cy={tip.y} key={`t${index}`} r={index % 3 === 0 ? 2 : 1.3} />
        ))}
        {rootTips.map((tip, index) => (
          <circle cx={tip.x} cy={tip.y} key={`u${index}`} opacity={0.7} r={1.1} />
        ))}
      </g>
      {sprouts.map((tip, index) => (
        <g key={`o${index}`}>
          <circle cx={tip.x} cy={tip.y} fill="var(--color-brand-orange)" opacity={0.25} r={5} />
          <circle cx={tip.x} cy={tip.y} fill="var(--color-brand-orange)" r={2.4} />
        </g>
      ))}
    </svg>
  );
}
