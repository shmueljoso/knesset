package com.shmueljoso.hamishkan;

import static org.junit.Assert.assertEquals;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * בדיקה שרצה על מכשיר/אמולטור אמיתי (androidTest).
 * ב-Android Studio: קליק ימני על הקובץ ← Run 'AppContextTest'.
 */
@RunWith(AndroidJUnit4.class)
public class AppContextTest {
    @Test
    public void packageNameIsOurs() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.shmueljoso.hamishkan", appContext.getPackageName());
    }
}
