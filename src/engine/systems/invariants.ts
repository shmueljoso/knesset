// בדיקת עקביות של המצב (לבדיקות ולפיתוח): מחזירה רשימת הפרות, ריקה אם הכול תקין.
import type { GameState } from '../types';

export function checkInvariants(s: GameState): string[] {
  const v: string[] = [];
  const parties = Object.values(s.parties);
  const pid = s.player.partyId;
  if (pid && !s.parties[pid]) v.push(`player.partyId ${pid} לא קיימת`);

  // יו"רים
  for (const p of parties) {
    if (p.leaderId === 'player') {
      if (pid !== p.id) v.push(`${p.name}: היו"ר הוא השחקן אבל השחקן במפלגה אחרת`);
    } else {
      const n = s.npcs[p.leaderId];
      if (!n) v.push(`${p.name}: יו"ר לא קיים (${p.leaderId})`);
      else if (n.partyId !== p.id) v.push(`${p.name}: היו"ר ${n.name} שייך למפלגה אחרת (${n.partyId})`);
    }
    if (p.seats > 0 && !p.list.includes(p.leaderId)) v.push(`${p.name}: היו"ר לא ברשימה`);
    if (!(p.poll >= 0) || !(p.base >= 0)) v.push(`${p.name}: סקר/בסיס לא תקין`);
  }
  if (pid && s.player.isMK && s.parties[pid]?.leaderId !== 'player' && parties.some((p) => p.leaderId === 'player')) v.push('השחקן יו"ר של מפלגה אחרת ממפלגתו');

  // מושבים
  if (s.seating.length !== 120) v.push(`מושבים: ${s.seating.length}`);
  if (new Set(s.seating).size !== s.seating.length) v.push('מושבים כפולים');
  // ח"כ עצמאי/ת ("פורש/ת") יושב/ת בלי להיות במנין של מפלגה
  const independent = s.seating.filter((id) => (id === 'player' ? !pid : !s.npcs[id]?.partyId)).length;
  const sum = parties.reduce((a, p) => a + p.seats, 0);
  if (sum + independent !== s.seating.length) v.push(`סכום מנדטים ${sum} + עצמאיים ${independent} ≠ מושבים ${s.seating.length}`);
  for (const p of parties) {
    const n = s.seating.filter((id) => (id === 'player' ? pid === p.id : s.npcs[id]?.partyId === p.id)).length;
    if (n !== p.seats) v.push(`${p.name}: ${p.seats} מנדטים אבל ${n} מושבים`);
  }
  for (const id of s.seating) {
    if (id === 'player') {
      if (!s.player.isMK) v.push('השחקן יושב אבל לא ח"כ');
    } else if (!s.npcs[id]?.isMK) v.push(`${s.npcs[id]?.name ?? id} יושב/ת אבל isMK=false`);
  }
  if (s.player.isMK && !s.seating.includes('player')) v.push('השחקן ח"כ אבל לא יושב');
  for (const n of Object.values(s.npcs)) if (n.isMK && !s.seating.includes(n.id)) v.push(`${n.name}: isMK אבל לא יושב/ת`);

  // קואליציה וממשלה
  const c = s.coalition;
  for (const id of c.parties) if (!s.parties[id]) v.push(`קואליציה: מפלגה ${id} לא קיימת`);
  for (const id of c.parties) if (c.satisfaction[id] === undefined) v.push(`קואליציה: אין שביעות רצון ל-${s.parties[id]?.name ?? id}`);
  if (!s.negotiation) {
    if (c.pmId !== 'player' && !s.npcs[c.pmId]) v.push(`ראש הממשלה ${c.pmId} לא קיים`);
    const pmParty = c.pmId === 'player' ? pid : s.npcs[c.pmId]?.partyId;
    if (pmParty && !c.parties.includes(pmParty)) v.push('מפלגת ראש הממשלה לא בקואליציה');
    const pmHolders = Object.values(s.npcs).filter((n) => n.ministry === 'pm').map((n) => n.id);
    if (c.pmId !== 'player' && (pmHolders.length !== 1 || pmHolders[0] !== c.pmId)) v.push(`תפקיד ראש הממשלה: ${pmHolders.join(',')} מול ${c.pmId}`);
    if (c.pmId === 'player' && pmHolders.length) v.push(`השחקן ראש ממשלה אבל ${pmHolders.join(',')} מסומנ/ת כראש הממשלה`);
    if (s.ministers.pm !== c.pmId) v.push('ministers.pm לא תואם');
    const pmN = s.npcs[c.pmId];
    if (pmN && !pmN.isMK && !s.rules.presidential) v.push('ראש הממשלה אינו ח"כ');
  }
  // בשיטה נשיאותית שרים יכולים להיות מחוץ לכנסת
  for (const [mid, who] of s.negotiation || s.rules.presidential ? [] : Object.entries(s.ministers)) {
    if (who === 'player') {
      if (mid !== 'pm' && s.player.ministry !== mid) v.push(`תיק ${mid}: השחקן אבל player.ministry=${s.player.ministry}`);
    } else if (!s.npcs[who]) v.push(`תיק ${mid}: ${who} לא קיים`);
    else if (!s.npcs[who].isMK && mid !== 'pm' && !s.norwegianSwaps?.[who]) v.push(`שר/ה ${s.npcs[who].name} (${mid}) אינו ח"כ`);
  }
  if (s.player.rank === 'minister' && !s.player.ministry && c.pmId !== 'player') v.push('דרגת שר בלי תיק');

  // ועדות
  for (const cm of s.committees) {
    if (cm.chairId && cm.chairId !== 'player' && !s.npcs[cm.chairId]) v.push(`ועדה ${cm.id}: יו"ר לא קיים`);
    for (const m of cm.members) if (m !== 'player' && !s.npcs[m]) v.push(`ועדה ${cm.id}: חבר לא קיים`);
  }

  // משא ומתן, ירושה, תורים
  const n = s.negotiation;
  if (n) {
    if (!s.parties[n.formateurParty]) v.push('משא ומתן: פורמטור לא קיים');
    for (const t of n.talks) if (!s.parties[t.partyId]) v.push(`משא ומתן: מפלגה ${t.partyId} לא קיימת`);
  }
  for (const x of s.succession ?? []) {
    if (!s.parties[x.partyId]) v.push('ירושה: מפלגה לא קיימת');
  }
  for (const [id, who] of Object.entries(s.norwegianSwaps ?? {})) if (!s.npcs[id] || (who !== 'player' && !s.npcs[who])) v.push('נורבגי: מפנה לא קיים');

  // מספרים
  const total = parties.reduce((a, p) => a + p.poll, 0);
  if (!(Math.abs(total - 100) < 1.5) && parties.length) v.push(`סכום סקרים ${total.toFixed(1)}`);
  for (const [k, val] of Object.entries(s.world)) if (!(val >= 0 && val <= 100)) v.push(`world.${k}=${val}`);
  for (const [k, val] of Object.entries(s.player)) if (typeof val === 'number' && Number.isNaN(val)) v.push(`player.${k} NaN`);
  if (!(s.coalition.stability >= 0 && s.coalition.stability <= 100)) v.push(`יציבות ${s.coalition.stability}`);
  return v;
}
