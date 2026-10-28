package com.shmueljoso.hamishkan;

import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * בדיקת יחידה שרצה על המחשב (בלי מכשיר): ./gradlew test, או קליק ימני ← Run.
 * BuildConfig נוצר אוטומטית מ-app/build.gradle.
 */
public class VersionTest {
    @Test
    public void versionCodeIsPositive() {
        assertTrue(BuildConfig.VERSION_CODE > 0);
    }

    @Test
    public void versionNameLooksLikeSemver() {
        assertTrue(BuildConfig.VERSION_NAME.matches("\\d+\\.\\d+\\.\\d+"));
    }
}
