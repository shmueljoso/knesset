// הפיצ'רים של האפליקציה: ווידג'ט, התראות, קישורים וקיצורי דרך.
import { describe, expect, it } from 'vitest';
import { createGame, type NewGameOptions } from '../src/engine';
import { nextChallengeAt, reminderText, widgetData } from '../src/appInfo';
import { openRoute, parseRoute } from '../src/routes';
import { useStore } from '../src/store';
import { weeklyChallenge } from '../src/online';

const opts: NewGameOptions = {
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed: 4,
};

describe('app shell', () => {
  it('parses app links, shortcuts and web share links', () => {
    expect(parseRoute('hamishkan://continue')).toBe('continue');
    expect(parseRoute('hamishkan://challenge/')).toBe('challenge');
    expect(parseRoute('hamishkan://s/abcd2345')).toBe('s/abcd2345');
    expect(parseRoute('https://hamishkan.x.workers.dev/#s=abcd2345')).toBe('s/abcd2345');
    expect(parseRoute('https://hamishkan.x.workers.dev/#go=board')).toBe('board');
    expect(parseRoute('https://hamishkan.x.workers.dev/')).toBeNull();
  });

  it('widget lines describe the party, the polls and the next election', () => {
    const g = createGame(opts);
    const w = widgetData(g);
    expect(w.title).toContain('שחקן');
    expect(w.line1).toMatch(/מנדטים/);
    expect(w.line2).toMatch(/בחירות בעוד \d+ שבועות/);
    g.electionWeek = g.week;
    expect(widgetData(g).line2).toBe('🗳️ שבוע בחירות!');
  });

  it('reminders depend on what waits in the game', () => {
    const g = createGame(opts);
    g.eventQueue = [{ id: 'x' } as never];
    expect(reminderText(g).title).toBe('יש החלטה שמחכה לך');
    g.eventQueue = [];
    g.negotiation = null;
    g.electionWeek = g.week + 3;
    expect(reminderText(g).title).toBe('בחירות בעוד 3 שבועות');
  });

  it('the challenge notification fires on the Monday that starts the next challenge', () => {
    const sun = new Date(2026, 10, 1, 12); // יום ראשון
    const at = nextChallengeAt(sun);
    expect(at.getDay()).toBe(1);
    expect(at.getHours()).toBe(18);
    expect(weeklyChallenge(at).id).not.toBe(weeklyChallenge(sun).id);
    // ביום שני אחרי 18:00 – כבר השבוע הבא
    const mon = new Date(2026, 10, 2, 19);
    expect(nextChallengeAt(mon).getDate()).toBe(9);
  });

  it('shortcuts open the right screen', async () => {
    useStore.setState({ game: null, screen: 'title', titleSheet: null, panels: [] });
    await openRoute('board');
    expect(useStore.getState().titleSheet).toBe('board');
    await openRoute('challenge');
    expect(useStore.getState().screen).toBe('create');
    expect(useStore.getState().pendingChallenge?.id).toBe(weeklyChallenge().id);
    // באמצע החלטה במשחק – לא קופצים החוצה
    const g = createGame(opts);
    useStore.setState({ game: g, screen: 'game' });
    g.eventQueue = [{ id: 'x' } as never];
    await openRoute('board');
    expect(useStore.getState().screen).toBe('game');
  });
});
