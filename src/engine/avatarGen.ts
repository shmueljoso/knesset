import type { NAME_POOLS } from './data/names';
import type { AvatarSpec, Gender } from './types';

export function makeAvatar(rnd: () => number, gender: Gender, pool: keyof typeof NAME_POOLS): AvatarSpec {
  let cover: AvatarSpec['cover'] = 'none';
  if (pool === 'haredi' && gender === 'm') cover = rnd() < 0.6 ? 'hat' : 'kippah-black';
  else if (pool === 'religious' && gender === 'm') cover = 'kippah';
  else if (pool === 'jewish' && gender === 'm' && rnd() < 0.15) cover = 'kippah';
  else if (pool === 'arab' && gender === 'f' && rnd() < 0.45) cover = 'hijab';
  return {
    seed: Math.floor(rnd() * 1e9),
    gender,
    cover,
    beard: gender === 'm' && (pool === 'haredi' || rnd() < (pool === 'religious' || pool === 'arab' ? 0.55 : 0.25)),
    glasses: rnd() < 0.3,
    age: 35 + Math.floor(rnd() * 35),
  };
}
