import { describe, expect, it } from 'vitest';
import { createGame, endWeek, type NewGameOptions } from '../src/engine';
import { BILL_TEMPLATES, templateById } from '../src/engine/data/bills';
import { ISSUES } from '../src/engine/data/issues';
import { coalitionMood, lawEffects, lawSectors, onLawPassed, recentLaw, strikeLaw } from '../src/engine/systems/issues';
import { startScandal, tickScandal } from '../src/engine/systems/scandals';
import { forecast } from '../src/engine/systems/votes';
import { createBill } from '../src/engine/systems/legislation';
import { SECTORS } from '../src/engine/util';

const base: NewGameOptions = {
  name: 'שחקן', gender: 'm', background: 'journalist',
  ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
  partyId: 'merkaz', scenario: 'freshman',
  avatar: { seed: 1, cover: 'none', beard: false, glasses: false, age: 40 }, seed: 5,
};
const WORLD = ['economy', 'affordability', 'housing', 'security', 'trust', 'cohesion'];

describe('every law has two sides', () => {
  it('templates are well formed and most visible laws carry a cost or a catch', () => {
    const visible = BILL_TEMPLATES.filter((t) => !t.hidden && !t.radical);
    expect(visible.length).toBeGreaterThanOrEqual(60);
    for (const t of visible) {
      for (const e of t.effects ?? []) {
        expect(WORLD).toContain(e.key);
        expect(e.note.length).toBeGreaterThan(3);
      }
      for (const x of t.scopeSectors ?? []) for (const k of Object.keys(x.sectors)) expect(SECTORS).toContain(k);
      if (t.issue) expect(ISSUES.some((i) => i.id === t.issue)).toBe(true);
      // לכל חוק יש מחיר: השפעה שלילית על העולם, על מגזר, או עלות תקציבית
      const neg = [...Object.values(t.world), ...(t.effects ?? []).map((e) => e.d), ...Object.values(t.sectors)].some((v) => (v ?? 0) < 0) || t.cost > 0;
      expect(neg, t.id).toBe(true);
    }
    expect(visible.filter((t) => t.effects?.length).length).toBeGreaterThan(visible.length * 0.8);
    for (const cat of ['economy', 'welfare', 'religion', 'society', 'security', 'governance', 'basic']) expect(visible.filter((t) => t.category === cat).length).toBeGreaterThanOrEqual(3);
  });

  it('the scope changes what happens, not just how much', () => {
    expect(lawEffects('wealth_fund', 1).length).toBeLessThan(lawEffects('wealth_fund', 3).length);
    expect(lawSectors('shabbat', 3).haredi!).toBeLessThan(lawSectors('shabbat', 1).haredi!);
  });
});

describe('logic of specific laws', () => {
  it('lowering the threshold helps small parties; raising it hurts them, and the court can undo it', () => {
    const s = createGame(base);
    onLawPassed(s, { templateId: 'threshold_down', title: 'הורדה', scope: 2, sponsor: 'npc' });
    expect(s.rules.threshold).toBe(2);
    expect(templateById('threshold_down').sectors.arab!).toBeGreaterThan(0);
    expect(templateById('threshold').sectors.arab!).toBeLessThan(0);
    strikeLaw(s, 'threshold_down');
    expect(s.rules.threshold).toBe(3.25);
  });

  it('small parties vote for a lower threshold, big ones against', () => {
    const s = createGame(base);
    s.player.ap = 99;
    const b = createBill(s, 'threshold_down', 2);
    if (typeof b === 'string') throw new Error(b);
    const f = forecast(s, b);
    for (const p of Object.values(s.parties)) {
      if (p.seats > 0 && p.seats <= 10 && p.id !== s.player.partyId) expect(f.lines[p.id]).toBe('for');
      if (p.seats >= 20 && p.id !== s.player.partyId) expect(f.lines[p.id]).toBe('against');
    }
  });

  it('controversial laws inflame their issue instead of calming it', () => {
    const s = createGame(base);
    s.issues.judiciary = 40;
    onLawPassed(s, { templateId: 'override', title: 'התגברות', scope: 2, sponsor: 'npc' });
    expect(s.issues.judiciary).toBeGreaterThan(40);
    expect(recentLaw(s, 'judiciary')).toBe(false);
    s.issues.housing = 80;
    onLawPassed(s, { templateId: 'housing', title: 'דיור', scope: 2, sponsor: 'npc' });
    expect(s.issues.housing).toBeLessThan(80);
    expect(recentLaw(s, 'housing')).toBe(true);
  });

  it('coalition partners react to laws that hit their voters', () => {
    const s = createGame(base);
    const haredi = s.coalition.parties.find((p) => s.parties[p].ideology.religion > 60);
    if (!haredi) return;
    const mood = coalitionMood(s, 'draft', 3).find((x) => x.id === haredi);
    expect(mood!.d).toBeLessThan(0);
    const before = s.coalition.satisfaction[haredi];
    onLawPassed(s, { templateId: 'draft', title: 'גיוס', scope: 3, sponsor: 'npc' });
    expect(s.coalition.satisfaction[haredi]).toBeLessThan(before);
  });

  it('the "French law" freezes an investigation against a sitting PM', () => {
    const s = createGame(base);
    s.coalition.pmId = 'player';
    startScandal(s, 'בדיקה', 50);
    onLawPassed(s, { templateId: 'immunity', title: 'החוק הצרפתי', scope: 1, sponsor: 'npc' });
    s.week = s.scandal!.nextWeek + 3;
    tickScandal(s);
    expect(s.eventQueue.some((e) => e.eventId === 'scandal_stage')).toBe(false);
    expect(s.flags.immunityFrozen).toBe(true);
    s.coalition.pmId = Object.keys(s.npcs)[0];
    tickScandal(s);
    s.week += 2;
    tickScandal(s);
    expect(s.eventQueue.some((e) => e.eventId === 'scandal_stage')).toBe(true);
  });
});

describe('lowering the electoral threshold', () => {
  it('makes new small parties appear in the polls and lessens the fear of a wasted vote', () => {
    let waves = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = createGame({ ...base, seed });
      const before = Object.keys(s.parties).length;
      onLawPassed(s, { templateId: 'threshold_down', title: 'הורדה', scope: 3, sponsor: 'npc' });
      expect(s.rules.threshold).toBe(1.5);
      expect(s.flags.thrWave).toBeGreaterThan(0);
      for (let i = 0; i < 60; i++) {
        s.eventQueue = [];
        endWeek(s);
      }
      const fresh = Object.values(s.parties).filter((p) => p.id.startsWith('np'));
      if (Object.keys(s.parties).length > before || fresh.length) waves++;
      expect(s.news.some((n) => n.headline.includes('אחרי הורדת אחוז החסימה'))).toBe(true);
    }
    expect(waves).toBeGreaterThan(3);
  });

  it('small parties poll higher the lower the threshold, and lower when it is raised', () => {
    // ממוצע על כמה עולמות: בעולם בודד מפלגה חדשה שקמה במקרה מטה את התוצאה
    const mk = (thr: number) => {
      let sum = 0;
      for (const seed of [8, 9, 10, 11, 12, 13]) {
        const s = createGame({ ...base, seed });
        s.rules.threshold = thr;
        for (let i = 0; i < 30; i++) {
          s.eventQueue = [];
          endWeek(s);
        }
        sum += Object.values(s.parties).filter((p) => p.base < 6).reduce((a, p) => a + p.poll, 0);
      }
      return sum / 6;
    };
    expect(mk(1.5)).toBeGreaterThan(mk(3.25));
    expect(mk(5)).toBeLessThan(mk(3.25));
  });
});
