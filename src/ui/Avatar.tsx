import { memo } from 'react';
import { makeLocalRng } from '../engine/rng';
import type { AvatarSpec } from '../engine/types';

const SKIN = ['#f5d0b5', '#eabf9f', '#d9a37f', '#c68863', '#a86b4a', '#7c4a32'];
const HAIR = ['#1f1a17', '#3b2a20', '#5a3d2b', '#8a5a3b', '#b98a5a', '#2b2b2b'];
const SUIT = ['#1e293b', '#334155', '#1e3a5f', '#3f3f46', '#4b3b2f', '#0f172a', '#52525b'];
const KIPPAH = ['#2563eb', '#16a34a', '#a16207', '#7c3aed', '#be123c'];
const HIJAB = ['#7c2d12', '#1e3a8a', '#365314', '#581c87', '#0f766e', '#a8a29e'];

function AvatarImpl({ spec, size = 48, ring }: { spec: AvatarSpec; size?: number; ring?: string }) {
  const r = makeLocalRng(spec.seed);
  const skin = SKIN[Math.floor(r() * SKIN.length)];
  const old = spec.age >= 60;
  const grey = spec.age >= 52 && r() < 0.6;
  const hair = old ? '#b8b8b8' : grey ? '#7d7d7d' : HAIR[Math.floor(r() * HAIR.length)];
  const suit = SUIT[Math.floor(r() * SUIT.length)];
  const style = Math.floor(r() * 5);
  const tie = r() < 0.5;
  const kip = KIPPAH[Math.floor(r() * KIPPAH.length)];
  const hij = HIJAB[Math.floor(r() * HIJAB.length)];
  const bgHue = Math.floor(r() * 360);
  const f = spec.gender === 'f';
  const id = `av${spec.seed}`;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ flex: 'none', display: 'block' }}>
      <defs>
        <clipPath id={id}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect width="100" height="100" fill={`hsl(${bgHue} 30% 26%)`} />
        <circle cx="50" cy="40" r="38" fill={`hsl(${bgHue} 35% 32%)`} />
        {/* שיער ארוך מאחור */}
        {f && spec.cover === 'none' && style !== 3 && (
          <path d="M28 46 Q26 20 50 18 Q74 20 72 46 L74 76 Q50 84 26 76 Z" fill={hair} />
        )}
        {spec.cover === 'hijab' && <path d="M24 52 Q22 16 50 14 Q78 16 76 52 L84 100 L16 100 Z" fill={hij} />}
        {/* גוף */}
        <path d="M8 100 Q12 73 50 70 Q88 73 92 100 Z" fill={f && spec.cover !== 'hijab' ? suit : suit} />
        {spec.cover !== 'hijab' && <path d="M41 71 L50 88 L59 71 Z" fill="#f1f5f9" />}
        {!f && tie && <path d="M48.5 74 L51.5 74 L53 90 L50 94 L47 90 Z" fill={kip} />}
        <rect x="44" y="56" width="12" height="16" rx="5" fill={skin} />
        <rect x="44" y="64" width="12" height="4" fill="#000" opacity="0.08" />
        {/* ראש */}
        <ellipse cx="33.5" cy="47" rx="3.2" ry="5" fill={skin} />
        <ellipse cx="66.5" cy="47" rx="3.2" ry="5" fill={skin} />
        <ellipse cx="50" cy="45" rx="16.5" ry="19.5" fill={skin} />
        {/* שיער עליון */}
        {spec.cover !== 'hijab' && spec.cover !== 'hat' && (
          <>
            {!f && style === 0 && <path d="M33 44 Q32 22 50 22 Q68 22 67 44 Q64 31 50 30 Q36 31 33 44 Z" fill={hair} />}
            {!f && style === 1 && <path d="M33.5 46 Q33 36 36 33 L37 42 Z M66.5 46 Q67 36 64 33 L63 42 Z" fill={hair} />}
            {!f && style === 2 && <path d="M33 42 Q31 21 52 21 Q69 23 67 42 Q60 28 44 31 Q37 33 33 42 Z" fill={hair} />}
            {!f && style >= 3 && (
              <g fill={hair}>
                {[34, 40, 46, 52, 58, 64].map((x, i) => (
                  <circle key={i} cx={x} cy={i % 2 ? 26 : 28} r="5.5" />
                ))}
                <circle cx="35" cy="34" r="4" />
                <circle cx="65" cy="34" r="4" />
              </g>
            )}
            {f && style !== 3 && <path d="M33 46 Q31 22 50 22 Q69 22 67 46 Q62 29 48 30 Q38 33 33 46 Z" fill={hair} />}
            {f && style === 3 && <path d="M30 56 Q27 20 50 20 Q73 20 70 56 L64 56 Q66 34 50 30 Q36 32 36 56 Z" fill={hair} />}
          </>
        )}
        {/* פנים */}
        <path d="M40.5 41 Q43.5 39.5 46.5 41" stroke={hair === '#b8b8b8' ? '#777' : hair} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M53.5 41 Q56.5 39.5 59.5 41" stroke={hair === '#b8b8b8' ? '#777' : hair} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <ellipse cx="43.5" cy="45.5" rx="1.9" ry="2.1" fill="#1f2937" />
        <ellipse cx="56.5" cy="45.5" rx="1.9" ry="2.1" fill="#1f2937" />
        <path d="M50 47 Q48.5 52 50.5 53" stroke="#000" strokeOpacity="0.25" strokeWidth="1.2" fill="none" />
        <path d="M45 57 Q50 60 55 57" stroke="#7f1d1d" strokeOpacity="0.7" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        {old && <path d="M38 50 Q39 52 40 50 M60 50 Q61 52 62 50" stroke="#000" strokeOpacity="0.15" fill="none" />}
        {spec.beard && <path d="M34 48 Q35 66 50 68 Q65 66 66 48 Q63 58 56 60 Q50 62 44 60 Q37 58 34 48 Z" fill={hair} opacity="0.95" />}
        {spec.beard && <path d="M45 57 Q50 59.5 55 57" stroke="#7f1d1d" strokeOpacity="0.6" strokeWidth="1.3" fill="none" />}
        {spec.glasses && (
          <g stroke="#111827" strokeWidth="1.5" fill="#bfdbfe" fillOpacity="0.15">
            <rect x="38" y="42" width="10.5" height="7.5" rx="3" />
            <rect x="51.5" y="42" width="10.5" height="7.5" rx="3" />
            <path d="M48.5 45 L51.5 45" fill="none" />
          </g>
        )}
        {spec.cover === 'kippah' && <ellipse cx="50" cy="24.5" rx="9" ry="3.6" fill={kip} stroke="#fff" strokeOpacity="0.4" strokeDasharray="1.5 1.5" />}
        {spec.cover === 'kippah-black' && <ellipse cx="50" cy="24.5" rx="10" ry="4.2" fill="#0b0b0b" />}
        {spec.cover === 'hat' && (
          <g fill="#0b0b0b">
            <ellipse cx="50" cy="29" rx="25" ry="5" />
            <path d="M36 29 Q36 12 50 12 Q64 12 64 29 Z" />
            <rect x="36" y="25" width="28" height="3" fill="#262626" />
          </g>
        )}
        {spec.cover === 'hijab' && <path d="M33 46 Q32 22 50 21 Q68 22 67 46 Q66 32 50 29 Q34 32 33 46 Z" fill={hij} />}
      </g>
      {ring && <circle cx="50" cy="50" r="48" fill="none" stroke={ring} strokeWidth="4" />}
    </svg>
  );
}

export const Avatar = memo(AvatarImpl);
