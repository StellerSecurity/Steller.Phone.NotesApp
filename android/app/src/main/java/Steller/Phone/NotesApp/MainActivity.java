package Steller.Phone.NotesApp;

import android.os.Bundle;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private BiometricScreenLock biometricScreenLock;

    BiometricScreenLock biometricScreenLock() { return biometricScreenLock; }
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StellarSecurityPlugin.class);
        boolean dark = getPreferences(MODE_PRIVATE).getBoolean("notesDarkTheme", false);
        int startSurface = dark ? Color.rgb(19, 21, 34) : Color.rgb(246, 246, 253);
        getWindow().setBackgroundDrawable(new ColorDrawable(startSurface));
        super.onCreate(savedInstanceState);
        if (getBridge() != null) getBridge().getWebView().setBackgroundColor(startSurface);
        applyScreenProtection();
        installSystemInsets();
        biometricScreenLock = new BiometricScreenLock(this);
    }

    @Override
    public void onResume() {
        super.onResume();
        applyScreenProtection();
        if (biometricScreenLock != null) biometricScreenLock.resume();
    }

    @Override
    public void onPause() {
        if (biometricScreenLock != null) biometricScreenLock.pause();
        super.onPause();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (biometricScreenLock != null && biometricScreenLock.credentialResult(requestCode, resultCode)) return;
        super.onActivityResult(requestCode, resultCode, data);
    }

    private void installSystemInsets() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars()
                | WindowInsetsCompat.Type.displayCutout());
            Insets keyboard = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
            return WindowInsetsCompat.CONSUMED;
        });
        updateAppearance(getPreferences(MODE_PRIVATE).getBoolean("notesDarkTheme", false), "none");
        ViewCompat.requestApplyInsets(content);
    }

    public void updateAppearance(boolean dark, String overlay) {
        if (biometricScreenLock != null) biometricScreenLock.setTheme(dark);
        if (getPreferences(MODE_PRIVATE).getBoolean("notesDarkTheme", false) != dark) {
            getPreferences(MODE_PRIVATE).edit().putBoolean("notesDarkTheme", dark).apply();
        }
        int surface = dark ? Color.rgb(19, 21, 34) : Color.rgb(246, 246, 253);
        if (!"none".equals(overlay)) {
            boolean popover = "popover".equals(overlay);
            float alpha = popover ? .42f : 68f / 255f;
            int tint = popover ? Color.rgb(11, 12, 25) : Color.rgb(19, 19, 44);
            surface = Color.rgb(Math.round(Color.red(surface) * (1 - alpha) + Color.red(tint) * alpha),
                Math.round(Color.green(surface) * (1 - alpha) + Color.green(tint) * alpha),
                Math.round(Color.blue(surface) * (1 - alpha) + Color.blue(tint) * alpha));
        }
        findViewById(android.R.id.content).setBackgroundColor(surface);
        getWindow().setStatusBarColor(surface);
        getWindow().setNavigationBarColor(surface);
        if (Build.VERSION.SDK_INT >= 29) getWindow().setNavigationBarContrastEnforced(false);
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView()).setAppearanceLightStatusBars(!dark);
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView()).setAppearanceLightNavigationBars(!dark);
    }

    boolean isScreenProtectionEnabled() {
        Object value = getSharedPreferences("CapacitorStorage", MODE_PRIVATE)
            .getAll().get("screenshot_protection_enabled");
        // Preserve the existing preference; missing or invalid values stay protected.
        return !Boolean.FALSE.equals(value) && !"false".equals(value);
    }

    boolean setScreenProtectionEnabled(boolean enabled) {
        boolean saved = getSharedPreferences("CapacitorStorage", MODE_PRIVATE).edit()
            .putString("screenshot_protection_enabled", String.valueOf(enabled)).commit();
        if (saved) applyScreenProtection();
        return saved;
    }

    private void applyScreenProtection() {
        if (isScreenProtectionEnabled()) getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }
}
