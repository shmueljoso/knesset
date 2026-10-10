import { useState } from 'react';
import { dateLabel, shortDateLabel } from '../engine/calendar';
import { BACKGROUNDS } from '../engine/data/backgrounds';
import { NEW_PARTY_COLORS } from '../engine/data/parties';
import { isCoalition } from '../engine/systems/government';
import { pollSeats } from '../engine/systems/opinion';
import { FOUND_COST, defect, foundParty, joinParty, leaveParty, splitFaction, splitInfo } from '../engine/systems/parties';
import { STAFF_ROLES, fireStaff, hireStaff, maxStaff, staffCandidates, staffCost } from '../engine/systems/staff';
import { ideologyDistance } from '../engine/util';
import { retire } from '../engine/systems/legacy';
import { modFromGame } from '../engine/mods';
import type { Drama } from '../engine/types';
import { clearSaved, useGame, useStore } from '../store';
import { Avatar } from './Avatar';
import { Empty, Sheet } from './common';
import { PapersView, PollsView } from './Media';

export function NewsView() {
  const g = useGame();
  const [view, setView] = useState<'all' | 'mine' | 'papers' | 'polls'>('all');
  const mine = view === 'mine';
  const items = g.news.filter((n) => !mine || n.aboutPlayer);
  return (
    <div className="scroll">
      <div className="page">
        <div className="seg" style={{ marginBottom: 6 }}>
          {([['all', 'חדשות'], ['mine', 'עליי'], ['papers', '🗞️ עיתונים'], ['polls', '📊 סקרים']] as const).map(([id, label]) => (
            <button key={id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </div>
        {view === 'papers' && <PapersView />}
        {view === 'polls' && <PollsView />}
        {(view === 'all' || view === 'mine') && items.length === 0 && <Empty>עוד לא כתבו עליך. זה ישתנה.</Empty>}
        {(view === 'all' || view === 'mine') && items.map((n) => (
          <article key={n.id} className={`news-item ${n.aboutPlayer ? 'about' : ''}`}>
            <div className="spread">
              <span className="outlet">{n.outlet}</span>
              <span className="tiny faint">{shortDateLabel(g, n.week)}</span>
            </div>
            <h4 className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              {n.npcId && g.npcs[n.npcId] && <Avatar spec={g.npcs[n.npcId].avatar} size={30} />}
              {n.tone === 'good' ? '🟢 ' : n.tone === 'bad' ? '🔴 ' : ''}
              {n.headline}
            </h4>
            {n.body && <p className="small muted" style={{ margin: '4px 0 0' }}>{n.body}</p>}
          </article>
        ))}
      </div>
    </div>
  );
}

const COLORS = NEW_PARTY_COLORS;
const DRAMA_OPTS: [Drama, string][] = [
  ['calm', '🌤️ רגוע'],
  ['normal', '⛅ רגיל'],
  ['wild', '🌪️ פרוע'],
];

export function PartySheet() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const close = useStore((s) => s.close);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const p = g.player;
  const current = p.partyId ? g.parties[p.partyId] : null;
  const info = splitInfo(g);
  const run = (fn: (s: typeof g) => { ok: boolean; text: string }) => {
    const r = act(fn);
    toast(r.text, r.ok ? 'good' : 'bad');
    if (r.ok) close();
  };
  const others = Object.values(g.parties)
    .filter((x) => x.id !== p.partyId && !x.playerFounded)
    .sort((a, b) => ideologyDistance(a.ideology, p.ideology) - ideologyDistance(b.ideology, p.ideology));

  return (
    <Sheet title="🔀 שייכות מפלגתית" sub={current ? `כרגע: ${current.name}` : 'ללא מפלגה'}>
      <div className="card small">
        <b>איך זה עובד באמת:</b>
        <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }} className="muted">
          <li>מעבר מפלגה מוריד מוניטין – וכל מעבר נוסף כואב יותר.</li>
          <li>מעבר בין מפלגות רחוקות אידיאולוגית פוגע בעקביות.</li>
          <li>ח"כ לא יכול לעבור סיעה באמצע כנסת. רק <b>פילוג</b> (לפחות שליש מהסיעה) או <b>פרישה</b>.</li>
          <li>"פורש" לא יכול להיות שר בכנסת הזו ולא לרוץ ברשימה של סיעה קיימת בבחירות הבאות.</li>
        </ul>
      </div>

      {p.isMK && current && !current.playerFounded && (
        <>
          <div className="section-label">כח"כ בסיעת {current.short}</div>
          <div className="card">
            <p className="small" style={{ marginTop: 0 }}>
              לפילוג חוקי צריך {info.needed} ח"כים מתוך {info.seats} (כולל אותך). מוכנים ללכת אחריך: <b>{info.followers.length}</b>
              {info.followers.length ? ` (${info.followers.map((f) => f.name).join(', ')})` : ''}.
            </p>
            <p className="tiny muted">ח"כים הולכים אחריך כשהיחס אליך 55+ והאמון 40+.</p>
            <input className="text-input" placeholder="שם הסיעה החדשה" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
            <ColorPick color={color} setColor={setColor} />
            <div className="col" style={{ marginTop: 10 }}>
              <button className="btn" disabled={info.followers.length + 1 < info.needed || !name.trim()} onClick={() => run((s) => splitFaction(s, name, color))}>
                ✂️ פילוג חוקי והקמת סיעה
              </button>
              <button className="btn danger" onClick={() => run((s) => defect(s))}>
                🚪 לפרוש לבד (להפוך ל"פורש")
              </button>
            </div>
          </div>
        </>
      )}

      {!p.isMK && (
        <>
          <div className="section-label">הצטרפות למפלגה</div>
          {others.map((x) => (
            <div key={x.id} className="list-item">
              <span className="party-dot" style={{ background: x.color, width: 14, height: 14 }} />
              <div className="grow">
                <b className="small">{x.name}</b>
                <div className="tiny muted">
                  {pollSeats(x.poll)} מנדטים בסקרים · {isCoalition(g, x.id) ? 'קואליציה' : 'אופוזיציה'} · התאמה {Math.round((1 - ideologyDistance(x.ideology, p.ideology)) * 100)}%
                </div>
              </div>
              <button className="btn sm" onClick={() => run((s) => joinParty(s, x.id))}>
                {current ? 'לעבור' : 'להצטרף'}
              </button>
            </div>
          ))}
          {current && !current.playerFounded && (
            <button className="btn danger block" style={{ marginTop: 10 }} onClick={() => run((s) => leaveParty(s))}>
              לעזוב את {current.name}
            </button>
          )}
        </>
      )}

      {!current?.playerFounded && (!p.isMK || p.defector) && (
        <>
          <div className="section-label">להקים מפלגה חדשה</div>
          <div className="card">
            <p className="small muted" style={{ marginTop: 0 }}>
              רישום אצל רשם המפלגות, אגרה ומטה ראשוני: {FOUND_COST} אלף ₪. את/ה בראש הרשימה; את השאר מגייסים במטה. כדי להיכנס לכנסת צריך 3.25%.
            </p>
            <input className="text-input" placeholder="שם המפלגה" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
            <ColorPick color={color} setColor={setColor} />
            <button className="btn primary block" style={{ marginTop: 10 }} disabled={!name.trim() || p.money < FOUND_COST} onClick={() => run((s) => foundParty(s, name, color))}>
              🏗️ להקים ({FOUND_COST} אלף ₪)
            </button>
          </div>
        </>
      )}
      {current?.playerFounded && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>{current.name}</h3>
          <p className="small muted">
            {pollSeats(current.poll)} מנדטים בסקרים ({current.poll.toFixed(1)}%). ברשימה: {current.list.length} מועמדים. גייס/י מועמדים במטה המפלגה.
          </p>
        </div>
      )}
    </Sheet>
  );
}

function ColorPick({ color, setColor }: { color: string; setColor: (c: string) => void }) {
  return (
    <div className="row" style={{ marginTop: 8, gap: 8 }}>
      {COLORS.map((c) => (
        <button key={c} onClick={() => setColor(c)} aria-label={c} style={{ width: 30, height: 30, borderRadius: 999, background: c, outline: color === c ? '3px solid var(--gold)' : 'none', outlineOffset: 2 }} />
      ))}
    </div>
  );
}

export function StaffSheet() {
  const g = useGame();
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const cands = staffCandidates(g);
  return (
    <Sheet title="👥 צוות הלשכה" sub={`${g.player.staff.length}/${maxStaff(g)} תקנים${g.player.isMK ? ' · משולם מתקציב הכנסת' : ' · על חשבונך'}`}>
      {g.player.staff.length === 0 && <Empty>הלשכה ריקה. צוות טוב = יותר זמן והשפעה.</Empty>}
      {g.player.staff.map((st) => (
        <div key={st.id} className="list-item">
          <Avatar spec={st.avatar} size={42} />
          <div className="grow">
            <b className="small">{st.name}</b>
            <div className="tiny muted">
              {STAFF_ROLES[st.role][st.gender]} · רמה {st.level} · נאמנות {Math.round(st.loyalty)}
            </div>
          </div>
          <button className="btn sm danger" onClick={() => toast(act((s) => fireStaff(s, st.id)), 'neutral')}>
            פיטורים
          </button>
        </div>
      ))}
      <div className="section-label">מועמדים השבוע</div>
      {cands.map((c) => (
        <div key={c.id} className="list-item">
          <Avatar spec={c.avatar} size={42} />
          <div className="grow">
            <b className="small">
              {c.name} · {STAFF_ROLES[c.role][c.gender]}
            </b>
            <div className="tiny muted">
              רמה {c.level} · {STAFF_ROLES[c.role].desc}
              {staffCost(g, c) ? ` · ${staffCost(g, c)} אלף ₪ לשבוע` : ''}
            </div>
          </div>
          <button
            className="btn sm"
            onClick={() => {
              const r = act((s) => hireStaff(s, c));
              toast(r, r.includes('הצטרף') ? 'good' : 'bad');
            }}
          >
            גיוס
          </button>
        </div>
      ))}
    </Sheet>
  );
}

export function SettingsSheet() {
  const g = useGame();
  const setScreen = useStore((s) => s.setScreen);
  const closeAll = useStore((s) => s.closeAll);
  const [confirm, setConfirm] = useState(false);
  const [retireConfirm, setRetireConfirm] = useState(false);
  const act = useStore((s) => s.act);
  const setPendingMod = useStore((s) => s.setPendingMod);
  const bg = BACKGROUNDS.find((b) => b.id === g.player.background)!;
  const exportSave = () => {
    const blob = new Blob([JSON.stringify(g)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hamishkan-${g.player.name}-week${g.week + 1}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <Sheet title="⚙️ תפריט" sub={`${g.player.name} · ${bg.name[g.player.gender]} · ${dateLabel(g)}`}>
      <div className="card small">
        <div>המשחק נשמר אוטומטית אחרי כל פעולה.</div>
        <div className="muted">הישגים: {g.player.achievements.length ? g.player.achievements.map((a) => ({ first_law: 'חוק ראשון', elected: 'נבחר/ה לכנסת', chair: 'יו"ר ועדה', minister: 'שר/ה', leader: 'יו"ר מפלגה', pm: 'ראשות הממשלה' })[a] ?? a).join(' · ') : 'עדיין אין'}</div>
      </div>
      <div className="card small" style={{ marginTop: 10 }}>
        <b>🌪️ רמת דרמה</b>
        <div className="tiny muted">כמה טלטלות: מפלגות חדשות, מלחמות, כתבי אישום, פילוגים.</div>
        <div className="filter-row" style={{ marginTop: 6 }}>
          {DRAMA_OPTS.map(([id, label]) => (
            <button key={id} className={(g.settings?.drama ?? 'normal') === id ? 'on' : ''} onClick={() => act((s) => void (s.settings = { ...s.settings, drama: id }))}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="col" style={{ marginTop: 12 }}>
        <button className="btn" onClick={exportSave}>
          💾 ייצוא שמירה לקובץ
        </button>
        <button className="btn" onClick={() => { setPendingMod(modFromGame(g)); closeAll(); setScreen('editor'); }}>
          🛠️ ייצוא הכנסת הנוכחית לעורך
        </button>
        <button className="btn" onClick={() => { closeAll(); setScreen('title'); }}>
          🏠 למסך הפתיחה
        </button>
        {!retireConfirm ? (
          <button className="btn" onClick={() => setRetireConfirm(true)}>
            🏁 לפרוש מהפוליטיקה (סיכום מורשת)
          </button>
        ) : (
          <button className="btn" onClick={() => { act((s) => retire(s)); closeAll(); }}>
            בטוח/ה? הקש/י שוב לפרישה
          </button>
        )}
        {!confirm ? (
          <button className="btn danger" onClick={() => setConfirm(true)}>
            🗑️ מחיקת המשחק והתחלה מחדש
          </button>
        ) : (
          <button className="btn danger" onClick={() => { clearSaved(); closeAll(); setScreen('create'); }}>
            בטוח? לחצ/י שוב למחיקה
          </button>
        )}
      </div>
    </Sheet>
  );
}

export function HelpSheet() {
  const g = useGame();
  const open = useStore((s) => s.open);
  return (
    <Sheet title="❓ איך משחקים" sub="המדריך המהיר">
      <div className="col small">
        <button className="btn primary" onClick={() => open({ kind: 'guide' })}>
          📖 מה מרוויחים ומה מפסידים מכל מהלך
        </button>
        <div className="card">
          <b>🤝 איחודים ואחוז החסימה</b> – מפלגה מתחת ל-{g.rules.threshold}% לא נכנסת. יו"ר מפלגה יכול/ה להציע איחוד או הסכם עודפים במטה המפלגה ← "איחודים ובריתות" (רק לפני סגירת הרשימות). מפלגות קטנות מתאחדות גם לבד, וב-6 השבועות האחרונים מצביעים בורחים ממפלגות שמתחת לחסימה.
        </div>
        <div className="card">
          <b>🗳️ הצבעות חיות ואולטימטום</b> – כל הצבעה במליאה נספרת מושב אחרי מושב. בהצבעה צמודה אפשר "לרוץ למזנון" ולהביא נעדרים (2 הון לניסיון). כח"כ תצביע/י גם על חוקים של אחרים ועל התקציב – הצבעה נגד קו הסיעה עולה במעמד, וקול מכריע מביא כותרות. ועדת השרים חוסמת? בדף ההצעה: אולטימטום ("בלי החוק – אני פורש/ת") או ערר למליאת הממשלה (לשרים). אם קוראים לך את הבלוף – מחליטים: לממש או לסגת.
        </div>
        <div className="card">
          <b>🎬 רגעי מתח</b> – ספירת קולות עם שעון הצבעה, הצבעות אי-אמון חיות (61 מפילים), ליל פריימריז שבו המקום שלך ברשימה מתברר לאט, ליל בחירות עם מדגם וספירה, וראיון באולפן של שלוש שאלות. בחדשות: לשונית עיתונים (כל עיתון עם ההטיה שלו + טור רכילות) ולשונית סקרים (מגמות ו"מי מתאים לראשות הממשלה").
        </div>
        <div className="card">
          <b>🏛️ ריאליזם</b> – שלושה שבועות לפני התקציב השותפות דורשות (כראש ממשלה/שר אוצר מחליטים מה לתת; כיו"ר שותפה – כמה לסחוט). אחרי מחדל – ועדת חקירה ממלכתית ומסקנות. מינוי יועמ"ש ומפכ"ל, בקשת חנינה מהנשיא בשלב כתב האישום, וח"כים שמבקשים טובות – ומי שהבטחת לו ולא קיימת, יזכור.
        </div>
        <div className="card">
          <b>🪟 מתי מהפכה אפשרית?</b> – כשהממשלה תומכת ברעיון (ימנית, שמאלנית, דתית…), כשהקואליציה רחבה (72+, ובמיוחד 80+), או כשנפתח "חלון הזדמנויות" אחרי זעזוע: מלחמה ← סיפוח, משבר כלכלי ← הכנסה בסיסית/מדינה מינימלית, מחאת הגיוס ← צבא מקצועי, מחדל ← חוקה ושיטה נשיאותית. אז פחות ח"כים מפחדים, הקואליציה מתיישרת, הציבור פתוח יותר – וגם הממשלה עצמה עלולה להעלות מהפכה להצבעה. "אקלים פוליטי" מוצג בבונה ההצעות.
        </div>
        <div className="card">
          <b>🏛️ נשיא/ה ובג"ץ</b> – כל שבע שנים הכנסת בוחרת נשיא/ה בהצבעה חשאית בסבבים (61 בסבב א' וב'). ח"כ מוכר/ת ומוערך/ת יכול/ה להתמודד בעצמו/ה – וניצחון מסיים את הקריירה בפסגה. נשיא/ה שמחבב/ת אותך מגדיל/ה את סיכויי החנינה. בג"ץ פוסק גם ביוזמתו (גיוס, מינויים, עילת הסבירות) – אלא אם בוטלה הביקורת השיפוטית.
        </div>
        <div className="card">
          <b>🌋 הצעות מרחיקות לכת</b> – בניסוח חוק יש קטגוריה "🌋 מהפכות": שלום כולל, סיפוח, מדינת הלכה, הפרדת דת ומדינה, חוקה, ריבונות הכנסת, שיטה נשיאותית, הכנסה בסיסית, מדינה מינימלית, צבא מקצועי, מדינת כל אזרחיה ודחיית הבחירות. אין בהן משמעת קואליציונית, חלקן צריכות 80 ח"כים ומשאל עם – כמעט אין סיכוי. אבל אם עוברות, המדינה משתנה מהיסוד, עם שרשרת אירועי המשך.
        </div>
        <div className="card">
          <b>🌪️ טלטלות</b> – רמטכ"ל לשעבר או כוכב/ת טלוויזיה שמקימים מפלגה ומזנקים לדו-ספרתי, מלחמה, מחדל, משבר כלכלי, כתב אישום ליו"ר, פילוג, הקלטות, ועימות טלוויזיוני לפני הבחירות. ההייפ דועך עם הזמן אם לא מתחזק. את רמת הדרמה משנים בתפריט.
        </div>
        <div className="card">
          <b>⏱ זמן</b> – בכל שבוע יש {g.player.apMax} נקודות זמן. כל פעולה עולה זמן. כשנגמר – "סיום שבוע" והעולם מתקדם.
        </div>
        <div className="card">
          <b>🗺️ מפה</b> – הקש/י על בניין כדי ללכת אליו. בכל מקום יש פעולות אחרות ואנשים אחרים. במזנון סוגרים דילים; במטה המפלגה – רשימות, כסף ומעבר מפלגות.
        </div>
        <div className="card">
          <b>👥 יחסים</b> – לכל דמות יש יחס כלפיך, אמון ותכונות נסתרות (נקמן, מדליף, נאמן…). טובות נרשמות בפנקס – וגובים אותן.
        </div>
        <div className="card">
          <b>📜 חקיקה</b> – הנחה (45 יום), ועדת שרים, קריאה טרומית, ועדה, ראשונה, ועדה, שנייה-שלישית. לפני כל הצבעה – ספירת קולות ושכנוע מתלבטים.
        </div>
        <div className="card">
          <b>🪞 תדמית</b> – כל עמדה פומבית מזיזה מגזרים שונים לכיוונים שונים. עמדה שסותרת את מה שאמרת פוגעת בעקביות. ככל שאת/ה מוכר/ת יותר – ההשפעה גדולה יותר.
        </div>
        <div className="card">
          <b>🗳️ בחירות</b> – הגש/י מועמדות לרשימה לפני סגירת הרשימות. המקום נקבע לפי מעמד במפלגה, מוכרות, קמפיין ותמיכת בכירים. אחוז החסימה: 3.25%, חלוקה לפי בדר-עופר.
        </div>
        <div className="card">
          <b>🏛️ קואליציה</b> – לכל מפלגה שותפה יש שביעות רצון. מפלגה מתוסכלת פורשת; ממשלת מיעוט נופלת באי-אמון קונסטרוקטיבי (61 לממשלה חלופית) או שהכנסת מתפזרת. אם התקציב לא עובר עד סוף מרץ – בחירות.
        </div>
        <div className="card">
          <b>🤝 משא ומתן</b> – אם המפלגה שלך הגדולה בגוש – תקבל/י מנדט ל-28 יום (+14). מחלקים תיקים, ועדות, כספים, חקיקה ווטו. אם את/ה שותפה – מתמקחים על המחיר; כוח המיקוח תלוי בכמה צריכים אותך.
        </div>
        <div className="card">
          <b>🗂️ שר/ה</b> – תיק מקבלים מיו"ר המפלגה (מעמד 60+, מוניטין 50+) או במשא ומתן. במשרד: תכניות דגל, מנכ"ל ותקציב; בישיבות הממשלה – משמעת מול ראש הממשלה. אפשר גם להיות מפוטר/ת.
        </div>
        <div className="card">
          <b>🔥 סוגיות בוערות</b> – כל סוגיה מתחממת כשהמצב בתחום רע ומולידה מחאות. חוק שעובר בנושא מקרר אותה, ומוליד אירועי המשך (טקסים, מחאות נגד, עתירות לבג"ץ). עמדה פומבית בסוגיה בוערת – משפיעה יותר.
        </div>
        <div className="card">
          <b>🧭 איך מתקדמים</b> – בלוח, "מפת הכוח" מראה כמה מנדטים את/ה שווה למפלגה (מוכרות × תדמית בקהל של המפלגה), איפה את/ה ברשימה, ומה כל דמות יכולה לתת לך. בכרטיס של כל דמות: מה היא זוכרת עליך ומה היא יכולה לעשות בשבילך.
        </div>
        <div className="card">
          <b>⚖️ חוקי יסוד ובג"ץ</b> – חוק יסוד צריך 61 (או 80 אם שוריין) בקריאה השלישית. חוקים שנויים במחלוקת עלולים להיפסל בבג"ץ; עם פסקת התגברות אפשר לחוקק מחדש.
        </div>
        <div className="card">
          <b>🗂️ כנסת אמיתית ועורך</b> – במשחק חדש, בשלב "מפלגה", בוחרים "איזו כנסת?": בדיוני, הכנסת הראשונה (1949), הכנסת ה-25 (2022) או "לקראת הבחירות 2026". במסך הפתיחה יש "עורך כנסת" – בונים מפלגות, מושבים, סקרים, עמדות, קואליציה ושמות, ומשחקים או מורידים קובץ.
        </div>
        <div className="card">
          <b>🏁 סוף המשחק</b> – פרישה, הרשעה, פעמיים ברצף מחוץ לכנסת, או קדנציה מלאה כראש ממשלה. בסוף – סיכום מורשת עם ציון ותואר.
        </div>
        <div className="card">
          <b>👑 ראשות הממשלה</b> – התמודד/י על ראשות המפלגה במטה (ח"כ, מעמד 60+, מוכרות 30+). יו"ר המפלגה הגדולה בגוש מרכיב/ה את הממשלה.
        </div>
      </div>
    </Sheet>
  );
}
