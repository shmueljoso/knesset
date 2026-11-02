import { expect, test, type Page } from '@playwright/test';
import { createGame, endWeek, performAction, type GameState } from '../src/engine';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
};

function game(): GameState {
  const g = createGame({
    name: 'נועה כהן', gender: 'f', background: 'journalist',
    ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
    partyId: 'merkaz', scenario: 'freshman',
    avatar: { seed: 3, cover: 'none', beard: false, glasses: false, age: 38 }, seed: 9,
  });
  g.eventQueue = [];
  endWeek(g);
  g.eventQueue = [];
  g.report = null;
  g.player.ap = 5;
  g.player.fame = 50;
  return g;
}

async function open(page: Page, g: GameState) {
  await page.addInitScript((json) => localStorage.setItem('hamishkan.save.v1', json), JSON.stringify(g));
  await page.goto('/');
  await page.getByRole('button', { name: /המשך משחק/ }).click();
}

const npcOf = (g: GameState) => Object.values(g.npcs).find((n) => n.notable && n.isMK && n.partyId !== g.player.partyId)!.id;

const cases: [string, string, (g: GameState) => void][] = [
  ['studio', 'interview', (g) => void performAction(g, 'interview')],
  ['debate', 'debate', (g) => void g.eventQueue.push({ eventId: 'deb_round', ctx: { npc: npcOf(g), n: '2', issueName: 'יוקר המחיה' } })],
  ['corridor', 'whip', (g) => {
    g.flags.whipGot = 1;
    g.eventQueue.push({ eventId: 'whip_round', ctx: { npc: npcOf(g), n: '2', billTitle: 'חוק הדיור בהישג יד', bill: 'x' } });
  }],
  ['backroom', 'ally', (g) => void g.eventQueue.push({ eventId: 'ally_offer', ctx: { npc: npcOf(g) } })],
  ['protest', 'protest', (g) => void g.eventQueue.push({ eventId: 'housing_protest', ctx: {} })],
  ['court', 'court', (g) => void g.eventQueue.push({ eventId: 'court_ruling', ctx: {} })],
  ['breaking', 'attack', (g) => void g.eventQueue.push({ eventId: 'riv_attack', ctx: { npc: npcOf(g) } })],
];

for (const [kind, name, setup] of cases) {
  test(`event scene: ${kind}`, async ({ page }) => {
    const g = game();
    setup(g);
    await open(page, g);
    await expect(page.getByTestId(`scene-${kind}`)).toBeVisible();
    await page.waitForTimeout(400);
    await shot(page, `140-scene-${name}`);
  });
}
