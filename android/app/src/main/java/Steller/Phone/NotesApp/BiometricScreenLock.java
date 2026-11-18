package Steller.Phone.NotesApp;

import android.app.KeyguardManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.hardware.fingerprint.FingerprintManager;
import android.os.Build;
import android.os.CancellationSignal;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

final class BiometricScreenLock {
    private static final String ENABLED = "notesBiometricScreenLock";
    private static final int CREDENTIAL_REQUEST = 7814;
    private final MainActivity activity;
    private final FrameLayout cover;
    private final TextView message;
    private final TextView title;
    private boolean locked;
    private boolean credentialPending;
    private CancellationSignal cancellation;
    private Result pending;
    private int request;

    interface Result { void complete(boolean authenticated); }

    BiometricScreenLock(MainActivity activity) {
        this.activity = activity;
        cover = new FrameLayout(activity);
        cover.setClickable(true);
        cover.setFocusable(true);
        LinearLayout panel = new LinearLayout(activity);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setPadding(dp(28), dp(24), dp(28), dp(24));
        ImageView logo = new ImageView(activity);
        logo.setImageResource(R.mipmap.ic_launcher);
        panel.addView(logo, new LinearLayout.LayoutParams(dp(72), dp(72)));
        title = new TextView(activity);
        title.setText(R.string.biometric_lock_title);
        title.setTextSize(26);
        title.setTypeface(null, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleLayout = new LinearLayout.LayoutParams(-1, -2);
        titleLayout.topMargin = dp(24);
        panel.addView(title, titleLayout);
        message = new TextView(activity);
        message.setText(R.string.biometric_lock_message);
        message.setTextSize(16);
        message.setGravity(Gravity.CENTER);
        message.setPadding(0, dp(12), 0, dp(24));
        panel.addView(message, new LinearLayout.LayoutParams(-1, -2));
        Button unlock = button(R.string.biometric_lock_unlock, true);
        unlock.setOnClickListener(view -> unlock());
        panel.addView(unlock, new LinearLayout.LayoutParams(-1, dp(52)));
        Button passcode = button(R.string.biometric_lock_passcode, false);
        passcode.setOnClickListener(view -> {
            if (pending == null) {
                pending = success -> { if (success) reveal(); };
                request++;
                deviceCredential();
            }
        });
        LinearLayout.LayoutParams passcodeLayout = new LinearLayout.LayoutParams(-1, dp(52));
        passcodeLayout.topMargin = dp(12);
        panel.addView(passcode, passcodeLayout);
        FrameLayout.LayoutParams layout = new FrameLayout.LayoutParams(-1, -2, Gravity.CENTER);
        cover.addView(panel, layout);
        ((ViewGroup) activity.findViewById(android.R.id.content)).addView(cover, new ViewGroup.LayoutParams(-1, -1));
        setTheme(activity.getPreferences(0).getBoolean("notesDarkTheme", false));
        if (enabled()) conceal(); else cover.setVisibility(View.GONE);
    }

    void setTheme(boolean dark) {
        cover.setBackgroundColor(dark ? Color.rgb(19, 21, 34) : Color.rgb(246, 246, 253));
        title.setTextColor(dark ? Color.rgb(240, 240, 248) : Color.rgb(11, 12, 25));
        message.setTextColor(dark ? Color.rgb(174, 181, 202) : Color.rgb(98, 98, 106));
    }

    boolean enabled() { return activity.getPreferences(0).getBoolean(ENABLED, false); }

    int availability() {
        if (Build.VERSION.SDK_INT < 28) return BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE;
        if (Build.VERSION.SDK_INT >= 29) {
            BiometricManager manager = activity.getSystemService(BiometricManager.class);
            return manager == null ? BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE : manager.canAuthenticate();
        }
        FingerprintManager manager = activity.getSystemService(FingerprintManager.class);
        if (manager == null || !manager.isHardwareDetected()) return BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE;
        return manager.hasEnrolledFingerprints() ? BiometricManager.BIOMETRIC_SUCCESS : BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED;
    }

    void change(boolean enabled, Result result) {
        if (pending != null || locked) { result.complete(false); return; }
        authenticate(success -> {
            if (success) {
                activity.getPreferences(0).edit().putBoolean(ENABLED, enabled).apply();
                if (locked) reveal();
            }
            result.complete(success);
        });
    }

    void resume() {
        if (locked && !credentialPending && pending == null) cover.post(this::unlock);
    }

    void pause() {
        if (enabled()) conceal();
        CancellationSignal active = cancellation;
        if (!credentialPending && pending != null) finish(request, false);
        if (active != null) active.cancel();
        cancellation = null;
    }

    boolean credentialResult(int code, int result) {
        if (code != CREDENTIAL_REQUEST) return false;
        credentialPending = false;
        finish(request, result == android.app.Activity.RESULT_OK);
        return true;
    }

    private void unlock() {
        if (!locked || pending != null) return;
        authenticate(success -> { if (success) reveal(); });
    }

    private void authenticate(Result result) {
        pending = result;
        final int revision = ++request;
        if (Build.VERSION.SDK_INT < 28 || availability() != BiometricManager.BIOMETRIC_SUCCESS) {
            deviceCredential();
            return;
        }
        BiometricPrompt.Builder builder = new BiometricPrompt.Builder(activity)
            .setTitle(activity.getString(R.string.biometric_lock_title))
            .setSubtitle(activity.getString(R.string.biometric_lock_prompt));
        if (Build.VERSION.SDK_INT >= 30) builder.setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL);
        else if (Build.VERSION.SDK_INT >= 29) builder.setDeviceCredentialAllowed(true);
        else builder.setNegativeButton(activity.getString(R.string.biometric_lock_passcode), activity.getMainExecutor(), (dialog, which) -> deviceCredential());
        cancellation = new CancellationSignal();
        try {
            builder.build().authenticate(cancellation, activity.getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
                @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) { finish(revision, true); }
                @Override public void onAuthenticationError(int code, CharSequence error) {
                    if (!credentialPending) finish(revision, false);
                }
                @Override public void onAuthenticationFailed() { message.setText(R.string.biometric_lock_retry); }
            });
        } catch (RuntimeException error) { finish(revision, false); }
    }

    private void deviceCredential() {
        KeyguardManager manager = activity.getSystemService(KeyguardManager.class);
        Intent intent = manager == null ? null : manager.createConfirmDeviceCredentialIntent(
            activity.getString(R.string.biometric_lock_title), activity.getString(R.string.biometric_lock_prompt));
        if (intent == null) {
            finish(request, false);
            message.setText(R.string.biometric_lock_device_setup);
            return;
        }
        credentialPending = true;
        try { activity.startActivityForResult(intent, CREDENTIAL_REQUEST); }
        catch (RuntimeException error) { credentialPending = false; finish(request, false); }
    }

    private void finish(int revision, boolean success) {
        if (revision != request || pending == null) return;
        Result callback = pending;
        pending = null;
        request++;
        cancellation = null;
        if (!success) message.setText(R.string.biometric_lock_cancelled);
        callback.complete(success);
    }

    private void conceal() {
        locked = true;
        android.view.inputmethod.InputMethodManager keyboard = activity.getSystemService(android.view.inputmethod.InputMethodManager.class);
        if (keyboard != null) keyboard.hideSoftInputFromWindow(activity.getBridge().getWebView().getWindowToken(), 0);
        cover.setVisibility(View.VISIBLE);
        cover.bringToFront();
        activity.getBridge().getWebView().setVisibility(View.INVISIBLE);
        activity.getBridge().getWebView().setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
    }

    private void reveal() {
        locked = false;
        cover.setVisibility(View.GONE);
        activity.getBridge().getWebView().setVisibility(View.VISIBLE);
        activity.getBridge().getWebView().setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
        message.setText(R.string.biometric_lock_message);
    }

    private Button button(int label, boolean primary) {
        Button button = new Button(activity);
        button.setText(label);
        button.setTextSize(16);
        button.setAllCaps(false);
        button.setTextColor(primary ? Color.WHITE : Color.rgb(39, 97, 252));
        GradientDrawable background = new GradientDrawable();
        background.setColor(primary ? Color.rgb(39, 97, 252) : Color.TRANSPARENT);
        background.setCornerRadius(dp(14));
        button.setBackground(background);
        return button;
    }

    private int dp(int value) { return Math.round(value * activity.getResources().getDisplayMetrics().density); }
}
