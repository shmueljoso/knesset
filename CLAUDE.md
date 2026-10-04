# הנחיות לפיתוח

- המנוע (`src/engine`) חייב להישאר ללא תלות ב-React/DOM ודטרמיניסטי: אקראיות רק דרך `rand(s)` מ-`engine/rng.ts`.
- ה-GameState חייב להישאר JSON טהור (נשמר ב-localStorage). אין פונקציות או מחלקות במצב.
- תוכן חדש (אירועים, תבניות חוק) נכנס ל-`src/engine/data`. אפקטים נכתבים כ-`Op[]` כדי שתהיה תצוגה מקדימה.
- ה-UI משנה מצב רק דרך `useStore().act(fn)` (עותק → שינוי → שמירה).
- טקסטים בעברית, RTL. צבעי מפלגות אומתו לעיוורון צבעים – לשנות רק אחרי בדיקה.
- לפני commit: `npx tsc --noEmit -p . && npm test && npm run build`.
- סוגיות (`systems/issues.ts`): חוק חדש שאמור להשפיע על מחאות צריך `issue` בתבנית; אירועי מחאה בודקים `isHot`. אירועי המשך מתוזמנים דרך `aftermath` / `scheduleEvent`.
- שינויים במוכרות/מוניטין/מעמד במפלגה – דרך `addStat` (`engine/stats.ts`) או Op, כדי לשמור על תשואה פוחתת.
- שדות חדשים ב-GameState חייבים ברירת מחדל ב-`ensurePhase3` (`engine/migrate.ts`) כדי ששמירות ישנות ימשיכו לעבוד.
- מודים ותרחישים: קובצי JSON ב-`mods/` (נבדקים ב-`validateMod`, נטענים ל-bundle דרך `data/scenarios.ts`). נתונים אמיתיים מותרים רק שם, עם `source`, `asOf` ו-`realPeople`. הפרויקט לשימוש אישי – אין הגבלות על אירועים לדמויות אמיתיות.
- סקרים: שינוי מתמשך (הייפ/קריסה) דרך `momentum`/`swing` (Op) או `addMomentum`; אופ `poll` הוא רגעי. טלטלות ב-`data/shocks.ts` (setup + אירוע תגובה), איחודים ב-`systems/mergers.ts` (`mergeParties`/`removeParty` מנקים הפניות).
- בדיקת איזון: סימולציה ארוכה ב-`tests/engine.test.ts`; לפני שינוי מספרים כדאי להריץ סימולציה של 10 שנים בכמה זרעים.
