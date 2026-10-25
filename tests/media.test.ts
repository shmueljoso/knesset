import { describe, expect, it } from 'vitest';
import { createGame, endWeek, type NewGameOptions } from '../src/engine';
import { HEADLINES } from '../src/engine/data/headlines';
import { eventById } from '../src/engine/data/events';
import { performAction } from '../src/engine/actions';
import { currentEvent, resolveEvent } from '../src/engine/systems/events';
import { moodPull } from '../src/engine/systems/opinion';
import { PAPERS, paperFront } from '../src/engine/systems/papers';
import { latestSurvey, makeSurvey, moodLines, publishSurvey, tickMood } from '../src/engine/systems/surveys';
import { applyTransform } from '../src/engine/systems/transforms';
import { startFormateur, swearIn } from '../src/engine/systems/coalition';

const base: NewGameOptions = {
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed: 4,
};

describe('surveys', () => {
  it('a new game starts with a survey; a new one is published every two weeks', () => {
    const s = createGame(base);
    expect(s.surveys).toHaveLength(1);
    for (let i = 0; i < 6; i++) {
      s.eventQueue = [];
      endWeek(s);
    }
    expect(s.surveys.length).toBeGreaterThanOrEqual(3);
    const sv = latestSurvey(s)!;
    expect(Object.values(sv.seats).reduce((a, b) => a + b, 0)).toBe(120);
    expect(sv.pmFit.length).toBeGreaterThanOrEqual(2);
    expect(sv.pmFit.reduce((a, x) => a + x.pct, 0) + sv.pmNone).toBeGreaterThan(95);
    expect(sv.h2h.pa + sv.h2h.pb).toBeLessThanOrEqual(100);
    expect(sv.blocs.coalition + sv.blocs.opposition).toBe(120);
    expect(sv.topIssues.length).toBe(4);
    expect(s.news.some((n) => n.headline.startsWith('סקר '))).toBe(true);
  });

  it('a famous party leader is asked about – and a strong leader lifts the party', () => {
    const s = createGame(base);
    const party = s.parties.merkaz;
    party.leaderId = 'player';
    s.player.fame = 90;
    s.player.reputation = 85;
    const sv = makeSurvey(s);
    expect(sv.pmFit.some((x) => x.id === 'player')).toBe(true);
    const m = party.momentum ?? 0;
    publishSurvey(s);
    expect(party.momentum ?? 0).toBeGreaterThanOrEqual(m);
  });

  it('an angry public squeezes coalition partners', () => {
    const s = createGame(base);
    for (const k of Object.keys(s.world) as (keyof typeof s.world)[]) s.world[k] = 15;
    const partner = s.coalition.parties.find((p) => s.parties[p].leaderId !== s.coalition.pmId)!;
    const before = s.coalition.satisfaction[partner];
    publishSurvey(s);
    expect(latestSurvey(s)!.govApproval).toBeLessThan(30);
    expect(s.coalition.satisfaction[partner]).toBeLessThan(before);
  });

  it('the president question appears when the Knesset vote is near', () => {
    const s = createGame(base);
    s.presidentNextWeek = s.week + 10;
    expect(makeSurvey(s).presidentQ?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('public mood', () => {
  it('insecurity pulls the public to the hawks, and polls follow', () => {
    const s = createGame(base);
    s.world.security = 10;
    for (let i = 0; i < 60; i++) tickMood(s);
    expect(s.mood.security).toBeGreaterThan(25);
    expect(moodPull(s, { econ: 0, security: 80, religion: 0, judiciary: 0 })).toBeGreaterThan(0.8);
    expect(moodPull(s, { econ: 0, security: -80, religion: 0, judiciary: 0 })).toBeLessThan(-0.8);
    expect(moodLines(s)[0]).toMatch(/ניצי/);
  });
});

describe('news and papers', () => {
  it('headlines exist for the state of the country, including a changed regime', () => {
    expect(HEADLINES.length).toBeGreaterThanOrEqual(40);
    const s = createGame(base);
    applyTransform(s, 'halacha', 2, 'npc', 'r_halacha');
    expect(HEADLINES.filter((h) => h.when(s)).some((h) => h.id === 't_halacha')).toBe(true);
    for (const h of HEADLINES.filter((x) => x.when(s))) expect(h.make(s).length).toBeGreaterThan(0);
  });

  it('every paper has a front page; the haredi paper skips secular news', () => {
    const s = createGame(base);
    s.news.unshift({ id: 'x', week: s.week, outlet: 'x', headline: 'אוטובוסים בשבת יוצאים לדרך', tone: 'neutral', aboutPlayer: false });
    expect(PAPERS.length).toBeGreaterThanOrEqual(7);
    for (const p of PAPERS) expect(paperFront(s, p).length).toBeGreaterThan(0);
    const haredi = PAPERS.find((p) => p.id === 'haredi')!;
    expect(paperFront(s, haredi).some((x) => x.text.includes('בשבת'))).toBe(false);
  });

  it('the same story reads differently in each paper', () => {
    const s = createGame(base);
    s.news = [];
    for (let i = 0; i < 6; i++) s.news.push({ id: `n${i}`, week: s.week, outlet: 'x', headline: `הממשלה העבירה את החוק מספר ${i}`, tone: i % 2 ? 'bad' : 'good', aboutPlayer: false });
    const fronts = PAPERS.map((p) => paperFront(s, p).filter((x) => !x.own).map((x) => x.text));
    // אין שני עיתונים עם אותה כותרת
    const all = fronts.flat();
    expect(new Set(all).size).toBe(all.length);
    // וגם סדר ההצגה לא זהה בכולם
    const orders = new Set(fronts.map((f) => f.map((x) => x.match(/\d/)?.[0]).join('')));
    expect(orders.size).toBeGreaterThan(2);
  });

  it('a full unity government (everyone signed) can be sworn in and play on', () => {
    const s = createGame(base);
    s.parties.merkaz.leaderId = 'player';
    startFormateur(s);
    for (const t of s.negotiation!.talks) t.signed = true;
    expect(swearIn(s).ok).toBe(true);
    expect(s.committees.every((c) => !!c.chairId)).toBe(true);
    for (let i = 0; i < 20; i++) {
      s.eventQueue = [];
      endWeek(s);
    }
  });

  it('interview questions follow the situation', () => {
    for (const id of ['iv_poll', 'iv_pm', 'iv_rule', 'iv_war', 'iv_scandal', 'iv_bill', 'iv_rival']) expect(eventById(id)).toBeDefined();
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const s = createGame({ ...base, seed });
      s.world.security = 30;
      s.player.location = 'studio';
      s.player.ap = 5;
      performAction(s, 'interview');
      for (let i = 0; i < 3; i++) {
        seen.add(currentEvent(s)!.ev.id);
        resolveEvent(s, 2);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });
});
