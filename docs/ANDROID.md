# המשכן לאנדרואיד – מדריך Android Studio

## בקצרה: מה באמת צריך?

**כדי לשחק בטלפון – לא צריך כלום מכל זה.**

1. מורידים את הקובץ `hamishkan-debug.apk`: מהצ'אט, או מ-GitHub ← **Releases ← android-latest**.
2. פותחים אותו בטלפון. אנדרואיד ישאל אם לאשר התקנה "ממקור לא ידוע" – מאשרים.
3. זהו. בכל עדכון מורידים את ה-APK החדש ומתקינים מעל. השמירות נשארות.

**מה זה Capacitor, במשפט:** המשחק הוא אתר, ו-Capacitor עוטף את האתר באפליקציה אמיתית. האפליקציה היא חלון דפדפן (WebView) על כל המסך, ועוד כמה "מתאמים" לטלפון: כפתור חזור, קבצים, שיתוף ורטט. לא צריך להבין אותו כדי לשחק. הוא חשוב רק אם רוצים לפתוח את הקוד ב-Android Studio.

| מה | הכרחי? | למה |
| --- | --- | --- |
| הקובץ APK | ✅ כדי לשחק | זו האפליקציה |
| Cloudflare (`docs/CLOUDFLARE.md`) | ❌ | רק לחשבונות, שמירה בענן וטבלת שיאים. בלי זה הכול עובד במכשיר |
| GitHub Actions | ❌ (קורה לבד) | בונה APK חדש בכל push |
| Android Studio | ❌ | רק ללמידה ולשינויים בקוד הנייטיב (ג'אווה) |
| Capacitor | ❌ (כבר מוגדר) | הכלי שמחבר בין האתר לאפליקציה – לא נוגעים בו בדרך כלל |
| מפתח חתימה (keystore) | ❌ | רק אם רוצים לפרסם בחנות גוגל |

מכאן והלאה – המדריך המלא, למי שרוצה ללמוד Android Studio.

---

המדריך הזה בנוי ללמידה: כל שלב מסביר **מה** עושים, **למה**, ו**איפה** זה נמצא בפרויקט. בסוף יש תרגילים.

---

## 1. איך זה בנוי

```
┌────────────── אפליקציית אנדרואיד (APK) ──────────────┐
│  MainActivity (Java)                                 │
│   └─ BridgeActivity של Capacitor                     │
│        └─ WebView  ← מריץ את המשחק (React + TypeScript)│
│             ▲                                         │
│             │ "גשר" (Bridge): JS ⇄ Java               │
│             ▼                                         │
│  פלאגינים: App (כפתור חזור), Filesystem (גיבויים),    │
│  Share (ייצוא), Haptics (רטט), HamishkanNative (שלנו) │
└──────────────────────────────────────────────────────┘
```

- **המשחק עצמו** כתוב ב-`src/`: מנוע ב-TypeScript וממשק ב-React. אותו קוד רץ גם בדפדפן.
- **[Capacitor](https://capacitorjs.com)** אורז את התוצר (`dist/`) בתוך אפליקציה נייטיב. הוא מעתיק אותו ל-`android/app/src/main/assets/public` ופותח אותו ב-WebView.
- **פלאגינים** הם הדרך של ה-JavaScript לבקש מאנדרואיד דברים שאין לדפדפן, כמו קבצים, רטט וכפתור החזור.
  - כל הקריאות האלה מרוכזות ב-`src/platform.ts` וב-`src/nativeShell.ts`.
  - יש גם פלאגין אחד שכתבנו בעצמנו בג'אווה: `HamishkanNativePlugin.java`.

### סיור בקבצים החשובים

| קובץ | מה יש בו |
| --- | --- |
| `capacitor.config.ts` | שם האפליקציה, המזהה (`com.shmueljoso.hamishkan`) והגדרות פלאגינים |
| `android/app/build.gradle` | גרסה (`versionCode`/`versionName`), SDK, תלויות וחתימה |
| `android/variables.gradle` | גרסאות ה-SDK: `minSdk 24` (אנדרואיד 7), `targetSdk 36` |
| `android/app/src/main/AndroidManifest.xml` | ה"תעודת זהות": הרשאות, מסכים (Activities), אייקון |
| `android/app/src/main/java/com/shmueljoso/hamishkan/MainActivity.java` | המסך הראשי; כאן נרשם הפלאגין שלנו |
| `.../HamishkanNativePlugin.java` | הפלאגין שלנו: גרסה, דגם ומקום פנוי – מוצג במסך השמירות |
| `android/app/src/main/res/` | משאבים: `values/strings.xml` (שם), `values/colors.xml`, `values/styles.xml` (ערכת נושא ומסך פתיחה), `drawable/` (אייקון וקטורי), `mipmap-*/` (אייקונים לגרסאות ישנות) |
| `android/app/src/test/...` | בדיקות יחידה שרצות על המחשב |
| `android/app/src/androidTest/...` | בדיקות שרצות על מכשיר או אמולטור |

---

## 2. התקנה (פעם אחת)

1. **Node.js 22** – מ-[nodejs.org](https://nodejs.org).
2. **Android Studio** – מ-[developer.android.com/studio](https://developer.android.com/studio). בהתקנה הראשונה מסמנים:
   - Android SDK
   - Android SDK Platform
   - Android Virtual Device
3. **SDK 36:** בתוך Android Studio נכנסים ל-**Settings ← Languages & Frameworks ← Android SDK**.
   - בלשונית **SDK Platforms** מוודאים ש-Android 16 (API 36) מותקן.
   - בלשונית **SDK Tools** מוודאים ש-Build-Tools ו-Platform-Tools מותקנים.
4. **הורדת הקוד:**
   ```bash
   git clone https://github.com/shmueljoso/knesset.git
   cd knesset
   git checkout ccr-b895278b-7u0siq
   npm install
   ```

---

## 3. הרצה ראשונה

```bash
npm run android:sync     # בונה את המשחק ומעתיק אותו לפרויקט האנדרואיד
npm run android:open     # פותח את התיקייה android ב-Android Studio
```

אפשר גם לפתוח ידנית: ב-Android Studio בוחרים **File ← Open** ואז את התיקייה **`android`**, לא את שורש הפרויקט.

1. **Gradle Sync:** בפעם הראשונה Android Studio מוריד את Gradle והתלויות. זה לוקח כמה דקות, ורואים את ההתקדמות בפס התחתון.
2. **אמולטור:** פותחים את **Device Manager** (סמל הטלפון בצד ימין) ← **+** ← **Create Virtual Device**. בוחרים למשל Pixel 8 עם תמונת מערכת API 36.
3. **הרצה:** לוחצים על ▶️ **Run 'app'** (או Shift+F10). האפליקציה תותקן ותיפתח באמולטור.

### על טלפון אמיתי

1. **מצב מפתחים:** בטלפון נכנסים ל-**הגדרות ← אודות הטלפון** ומקישים 7 פעמים על **מספר Build**.
2. **ניפוי באגים:** ב-**הגדרות ← מערכת ← אפשרויות למפתחים** מפעילים **ניפוי באגים ב-USB**. אפשר להשתמש גם ב-**ניפוי באגים אלחוטי**, ומחברים דרך **Pair Devices Using Wi-Fi** ב-Device Manager.
3. **הרצה:** מחברים את הטלפון, מאשרים בו את המחשב, בוחרים אותו ברשימת המכשירים למעלה ולוחצים ▶️.

> **חשוב:** בכל פעם שמשנים קוד במשחק (`src/`) מריצים שוב `npm run android:sync` ורק אז ▶️. שינויים בקוד הג'אווה או ב-`res/` לא דורשים sync, רק ▶️.

---

## 4. איך מדבגים

- **Logcat** (בתחתית Android Studio): כאן מופיעות הודעות המערכת. כדי לראות רק את האפליקציה כותבים בשורת הסינון `package:mine`. שגיאות JavaScript מופיעות שם עם התגית `Capacitor/Console`.
- **דיבוג של המשחק עצמו (JS):** כשהאפליקציה רצה בגרסת debug, פותחים בכרום במחשב את הכתובת `chrome://inspect`. ליד WebView של המשכן לוחצים **inspect** ומקבלים DevTools מלא: Console, Elements, Network ו-Application, שבו רואים את localStorage ואת IndexedDB.
- **דיבוג בג'אווה:** לוחצים ליד מספר שורה ב-`HamishkanNativePlugin.java` כדי לשים נקודת עצירה, ואז מריצים עם 🐞 **Debug 'app'**. פותחים במשחק את **תפריט ← שמירות וגיבויים**, והקוד יעצור בנקודה.
- **Layout Inspector** (Tools ← Layout Inspector): מראה את עץ התצוגות של המסך. אצלנו זה בעיקר WebView אחד.
- **App Inspection ← Database / Files:** מראה את הקבצים שהאפליקציה שמרה, כולל `files/saves/`.

### טעינה חיה (בלי לבנות בכל שינוי)

```bash
npm run dev                                     # שרת הפיתוח (מדפיס כתובת כמו http://192.168.1.20:5173)
npx cap run android -l --external               # מריץ את האפליקציה כשהיא טוענת מהשרת הזה
```

כל שמירה של קובץ ב-`src/` מתעדכנת מיד בטלפון. המחשב והטלפון צריכים להיות באותה רשת.

---

## 5. השמירות – איפה הן נשמרות

| מה | איפה | מתי |
| --- | --- | --- |
| המשחק הנוכחי | `localStorage` של ה-WebView | אחרי כל פעולה |
| גיבוי אוטומטי (8 אחרונים) | `files/saves/*.sav` (דחוס gzip) + `index.json` | בכל סוף שבוע, וכשהאפליקציה יוצאת לרקע (לכל היותר פעם ב-3 דקות) |
| גיבוי שנתי (12) | אותה תיקייה | בכל שנה במשחק |
| גיבוי ביטחון (4) | אותה תיקייה | לפני מחיקה, לפני משחק חדש ולפני טעינה |
| שמירות ידניות (30) | אותה תיקייה | כשלוחצים "שמירה" |
| ייצוא | איפה שבוחרים בחלון השיתוף (Drive, קבצים, וואטסאפ) | ידני |

- **מסך הפתיחה:** אם השמירה הראשית אבדה, מסך הפתיחה מציע **♻️ שחזור הגיבוי האחרון**.
- **הסרת האפליקציה:** הסרה או "ניקוי נתונים" מוחקים את כל הקבצים בתיקיית האפליקציה. כדי לשמור משחק לתמיד מייצאים אותו לקובץ.
- **הקוד:** `src/saves.ts` (הלוגיקה, נבדק ב-`tests/saves.test.ts`) ו-`src/platform.ts` (קבצים באנדרואיד, IndexedDB בדפדפן).

---

## 6. בניית APK ופרסום

### APK לבדיקה (debug)

- **ב-Android Studio:** **Build ← Build App Bundle(s) / APK(s) ← Build APK(s)**. הקובץ נוצר ב-`android/app/build/outputs/apk/debug/app-debug.apk`.
- **משורת הפקודה:** `npm run android:apk`.
- **בלי מחשב:** בכל push ל-GitHub נבנה APK אוטומטית, לפי `.github/workflows/android.yml`. מורידים אותו מהטלפון ב-**Releases ← android-latest ← hamishkan-debug.apk**, ומאשרים התקנה ממקור לא ידוע.

### גרסה חתומה (release) – לחנות או להפצה

1. **יצירת מפתח:** **Build ← Generate Signed Bundle / APK** ← **Create new…**.
   - שומרים את קובץ ה-`.jks` **מחוץ לפרויקט**.
   - שומרים גיבוי של הקובץ ושל הסיסמה. בלי המפתח אי אפשר לעדכן את האפליקציה בחנות.
2. **קישור המפתח לבנייה:** יוצרים את הקובץ `android/keystore.properties`. הוא כבר מוחרג ב-`.gitignore` ולא נכנס ל-git:
   ```properties
   storeFile=/full/path/to/hamishkan.jks
   storePassword=...
   keyAlias=hamishkan
   keyPassword=...
   ```
3. **בנייה:** `cd android && ./gradlew bundleRelease` בונה AAB לגוגל פליי, ו-`assembleRelease` בונה APK.
4. **גרסה חדשה:** לפני כל פרסום מעלים את `versionCode` ב-`android/app/build.gradle` (למשל 1 ← 2) ומעדכנים את `versionName`.

---

## 7. תרגילים (מהקל לקשה)

1. **שם ואייקון:** שנו את `app_name` ב-`res/values/strings.xml` והריצו. אחר כך פתחו את **File ← New ← Image Asset** ונסו ליצור אייקון חדש.
2. **צבע מסך הפתיחה:** שנו את `hamishkan_bg` ב-`res/values/colors.xml`. מה קורה בטעינה?
3. **פלאגין – שדה חדש:** הוסיפו ל-`getInfo()` ב-`HamishkanNativePlugin.java` את השדה `ret.put("lang", java.util.Locale.getDefault().toString());`. הוסיפו `lang` גם לממשק `DeviceInfo` ב-`src/platform.ts` והציגו אותו ב-`src/ui/Saves.tsx`.
4. **פלאגין – מתודה חדשה:** כתבו `@PluginMethod public void keepAwake(PluginCall call)` שמשאירה את המסך דולק בזמן הצבעה חיה:
   ```java
   getActivity().runOnUiThread(() -> getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
   ```
   קראו לה מ-`LiveVote.tsx`.
5. **בדיקות:** הריצו את `VersionTest` (קליק ימני ← Run) ואת `AppContextTest` על אמולטור. שברו בכוונה את אחת הבדיקות וראו איך נראה כישלון.
6. **הרשאה:** הוסיפו התראה מקומית שמזכירה לחזור למשחק. זה דורש את `@capacitor/local-notifications` ואת ההרשאה `POST_NOTIFICATIONS` ב-Manifest, כולל בקשה בזמן ריצה.
7. **Kotlin:** כתבו מחדש את `HamishkanNativePlugin` ב-Kotlin. Android Studio יודע להמיר אוטומטית ב-**Code ← Convert Java File to Kotlin File**, אבל צריך להוסיף את הפלאגין `kotlin-android` ל-Gradle.

---

## 8. תקלות נפוצות

| תקלה | פתרון |
| --- | --- |
| `SDK location not found` | פותחים את התיקייה `android` ב-Android Studio, והוא יוצר `local.properties` לבד |
| מסך לבן/ישן אחרי שינוי במשחק | שכחתם `npm run android:sync` |
| `Unsupported class file major version` | Gradle צריך JDK 21: **Settings ← Build Tools ← Gradle ← Gradle JDK** |
| הטלפון לא מופיע | מאשרים את טביעת האצבע של המחשב בטלפון, ובמידת הצורך מנתקים ומחברים את הכבל או מחליפים מצב USB ל"העברת קבצים" |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | יש בטלפון גרסה שנחתמה במפתח אחר (למשל debug מול release). מסירים אותה ומתקינים מחדש. **השמירות יימחקו, אז מייצאים קודם.** |
