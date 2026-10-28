import { describe, expect, it } from 'vitest';
import { createGame, type NewGameOptions } from '../src/engine';
import { handleBack } from '../src/nativeShell';
import { useStore } from '../src/store';

const opts: NewGameOptions = {
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed: 4,
};

describe('android back button', () => {
  it('closes panels, then goes to the map, then to the title, then exits', () => {
    const g = createGame(opts);
    g.eventQueue = [];
    useStore.setState({ game: g, screen: 'game', tab: 'people', panels: [{ kind: 'settings' }], showReport: false });
    expect(handleBack()).toBe('closed');
    expect(useStore.getState().panels).toHaveLength(0);
    expect(handleBack()).toBe('tab');
    expect(useStore.getState().tab).toBe('map');
    expect(handleBack()).toBe('title');
    expect(useStore.getState().screen).toBe('title');
    expect(handleBack()).toBe('exit');
  });

  it('does not escape a pending decision', () => {
    const g = createGame(opts);
    g.eventQueue = [{ eventId: 'pres_welcome', ctx: {} }];
    useStore.setState({ game: g, screen: 'game', tab: 'map', panels: [] });
    expect(handleBack()).toBe('blocked');
    expect(useStore.getState().screen).toBe('game');
  });
});
