import type { BackgroundId, Sector, Skill } from '../types';

export interface BackgroundDef {
  id: BackgroundId;
  name: { m: string; f: string };
  icon: string;
  desc: string;
  skills: Partial<Record<Skill, number>>;
  fame: number;
  reputation: number;
  money: number;
  approval: Partial<Record<Sector, number>>;
  committee: string;
}

export const BACKGROUNDS: BackgroundDef[] = [
  {
    id: 'aide', name: { m: 'עוזר פרלמנטרי', f: 'עוזרת פרלמנטרית' }, icon: '📎',
    desc: 'מכיר/ה את המסדרונות מבפנים. מתחיל/ה כעוזר/ת של ח"כ, עם קשרים טובים ומעט מוכרות.',
    skills: { law: 40, organization: 40, negotiation: 30 }, fame: 4, reputation: 45, money: 40, approval: {}, committee: 'constitution',
  },
  {
    id: 'journalist', name: { m: 'עיתונאי', f: 'עיתונאית' }, icon: '🗞️',
    desc: 'פנים מוכרות מהמסך. הציבור מכיר אותך, הפוליטיקאים פחות סומכים עליך.',
    skills: { media: 60, speech: 45 }, fame: 28, reputation: 25, money: 70, approval: { secular: 4 }, committee: 'education',
  },
  {
    id: 'officer', name: { m: 'קצין בכיר במיל׳', f: 'קצינה בכירה במיל׳' }, icon: '🎖️',
    desc: 'אלוף/ה במיל׳ עם תדמית ביטחונית. אמינות ציבורית גבוהה, מעט ניסיון פוליטי.',
    skills: { organization: 60, negotiation: 35, speech: 35 }, fame: 16, reputation: 35, money: 90,
    approval: { traditional: 7, religious: 6, olim: 6, secular: 4, arab: -4 }, committee: 'security',
  },
  {
    id: 'entrepreneur', name: { m: 'יזם היי-טק', f: 'יזמית היי-טק' }, icon: '💻',
    desc: 'אקזיט מוצלח וכיס עמוק. מימון קמפיינים קל, אבל צריך ללמוד את הפוליטיקה מאפס.',
    skills: { negotiation: 50, organization: 45 }, fame: 8, reputation: 25, money: 450, approval: { secular: 3, olim: 2 }, committee: 'economy',
  },
];

export const backgroundById = (id: BackgroundId) => BACKGROUNDS.find((b) => b.id === id)!;
