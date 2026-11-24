package Steller.Phone.NotesApp;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Intent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.graphics.drawable.StateListDrawable;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.*;
import androidx.core.view.*;
import org.json.JSONObject;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** User-readable notes only. Device credential confirmation precedes access or saving. */
public final class LocalNotesExportActivity extends Activity {
    private static final int SAVE = 4210;
    private static final int BLUE = 0xff2761fc;
    private String payloadId, json;
    private long authorizationUntil;
    private boolean dark, authenticated, authenticating, pickerOpen, busy, saved;
    private CancellationSignal authentication;
    private Thread writer;
    private android.app.Dialog confirmation;
    private android.os.CountDownTimer confirmationCountdown;
    private long confirmationReadyAt;
    private final android.os.Handler expiryHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private boolean screenReceiverRegistered;
    private final Runnable expireAuthorization = () -> {
        authenticated = false; json = null; LocalExportPayload.discard(payloadId);
        if (writer != null) writer.interrupt();
        if (!isFinishing()) finish();
    };
    private final BroadcastReceiver screenOff = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (Intent.ACTION_SCREEN_OFF.equals(intent.getAction())) expireAuthorization.run();
        }
    };
    private LinearLayout root;
    private Button save;
    private ProgressBar progress;
    private TextView status;
    private android.content.res.Resources labels;
    private String label(int resource) { return labels.getString(resource); }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private int surface() { return dark ? 0xff131522 : 0xfff6f6fd; }
    private int ink() { return dark ? 0xffeef0fa : 0xff0b0c19; }
    private int muted() { return dark ? 0xffa1a7bd : 0xff62626a; }
    private int card() { return dark ? 0xff1c2032 : Color.WHITE; }
    private int line() { return dark ? 0xff2b3045 : 0xffeaeaf0; }
    private GradientDrawable shape(int color, int border, int radius) {
        GradientDrawable result = new GradientDrawable(); result.setColor(color); result.setCornerRadius(dp(radius));
        if (border != Color.TRANSPARENT) result.setStroke(dp(1), border);
        return result;
    }
    private TextView text(String value, int size, boolean medium) {
        TextView result = new TextView(this); result.setText(value); result.setTextSize(size);
        result.setTextColor(ink()); result.setTypeface(Typeface.create(medium ? "sans-serif-medium" : "sans-serif", Typeface.NORMAL));
        result.setLineSpacing(dp(3), 1.08f); result.setIncludeFontPadding(false); return result;
    }
    private void gap(LinearLayout parent, int size) { View gap = new View(this); parent.addView(gap, new LinearLayout.LayoutParams(1, dp(size))); }
    private void privacy() {
        Object value = getSharedPreferences("CapacitorStorage", MODE_PRIVATE).getAll().get("screenshot_protection_enabled");
        if (Boolean.FALSE.equals(value) || "false".equals(value)) getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        android.content.res.Configuration localized = new android.content.res.Configuration(getResources().getConfiguration());
        String language = getIntent().getStringExtra("language");
        if (language != null && language.matches("[a-z]{2,3}(-[A-Za-z]{2,4})?")) localized.setLocale(Locale.forLanguageTag(language));
        labels = createConfigurationContext(localized).getResources();
        dark = getIntent().getBooleanExtra("notesDarkTheme", false);
        payloadId = getIntent().getStringExtra("payloadId");
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        privacy(); buildPage(false, null);
        long deadline = LocalExportPayload.deadline(payloadId);
        if (deadline <= android.os.SystemClock.elapsedRealtime()) { finish(); return; }
        expiryHandler.postDelayed(expireAuthorization, deadline - android.os.SystemClock.elapsedRealtime());
        IntentFilter filter = new IntentFilter(Intent.ACTION_SCREEN_OFF);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(screenOff, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(screenOff, filter);
        screenReceiverRegistered = true;
        authenticate();
    }
    @Override public void onResume() { super.onResume(); privacy(); }
    private void authenticate() {
        KeyguardManager keyguard = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        // Only DEVICE_CREDENTIAL is accepted: a fingerprint must not satisfy this action.
        if (Build.VERSION.SDK_INT < 30 || keyguard == null || !keyguard.isDeviceSecure()) {
            status.setText(label(Build.VERSION.SDK_INT < 30 ? R.string.local_export_android_required : R.string.local_export_set_code));
            return;
        }
        authenticating = true;
        authentication = new CancellationSignal();
        try {
            new BiometricPrompt.Builder(this).setTitle(label(R.string.local_export_auth_title))
                .setSubtitle(label(R.string.local_export_auth_copy))
                .setAllowedAuthenticators(BiometricManager.Authenticators.DEVICE_CREDENTIAL).build()
                .authenticate(authentication, getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
                    @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        authenticating = false;
                        if (isFinishing() || isDestroyed() || result.getAuthenticationType() != BiometricPrompt.AUTHENTICATION_RESULT_TYPE_DEVICE_CREDENTIAL) { finish(); return; }
                        authorizationUntil = LocalExportPayload.deadline(payloadId);
                        json = LocalExportPayload.take(payloadId);
                        if (json == null) { status.setText(label(R.string.local_export_expired)); return; }
                        try {
                            JSONObject data = new JSONObject(json);
                            if (!"stellar-encrypted-local-export".equals(data.optString("format")) || !LocalBackupFormat.valid(data.optJSONObject("backup"))) {
                                expireAuthorization.run(); return;
                            }
                            json = data.getJSONObject("backup").toString();
                            authenticated = true; buildPage(true, data);
                        } catch (Exception error) { json = null; status.setText(label(R.string.local_export_failed)); }
                    }
                    @Override public void onAuthenticationError(int code, CharSequence message) { authenticating = false; finish(); }
                });
        } catch (Exception error) { authenticating = false; status.setText(label(R.string.local_export_auth_failed)); }
    }
    private void buildPage(boolean ready, JSONObject data) {
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(surface());
        setContentView(root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            androidx.core.graphics.Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            root.setPadding(bars.left, bars.top, bars.right, bars.bottom); return WindowInsetsCompat.CONSUMED;
        });
        LinearLayout header = new LinearLayout(this); header.setGravity(Gravity.CENTER_VERTICAL); header.setPadding(dp(20), dp(12), dp(12), dp(12));
        ImageView icon = new ImageView(this); icon.setImageResource(R.mipmap.ic_launcher); icon.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        header.addView(icon, new LinearLayout.LayoutParams(dp(36), dp(36)));
        TextView brand = text(label(R.string.local_export_brand), 16, true); brand.setPadding(dp(10), 0, 0, 0);
        header.addView(brand, new LinearLayout.LayoutParams(0, -2, 1));
        Button close = new Button(this); close.setText(label(R.string.recovery_close)); close.setTextSize(22); close.setAllCaps(false);
        close.setTextColor(muted()); close.setPadding(0,0,0,0); close.setMinHeight(0); close.setMinimumHeight(0); close.setMinWidth(0); close.setMinimumWidth(0);
        close.setBackground(new RippleDrawable(ColorStateList.valueOf(0x222761fc), shape(card(), Color.TRANSPARENT, 14), null));
        close.setContentDescription(label(R.string.local_export_close)); close.setOnClickListener(v -> finish());
        header.addView(close, new LinearLayout.LayoutParams(dp(48), dp(48))); root.addView(header);
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(false); scroll.setVerticalScrollBarEnabled(false);
        LinearLayout body = new LinearLayout(this); body.setOrientation(LinearLayout.VERTICAL); body.setPadding(dp(20), dp(18), dp(20), dp(20)); scroll.addView(body);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        body.addView(text(label(R.string.backup_export_title), 28, true)); gap(body, 10);
        TextView intro = text(label(R.string.backup_export_intro), 15, false); intro.setTextColor(muted()); body.addView(intro); gap(body, 24);
        if (ready && data != null) {
            LinearLayout summary = new LinearLayout(this); summary.setOrientation(LinearLayout.VERTICAL); summary.setPadding(dp(18),dp(18),dp(18),dp(18));
            summary.setBackground(shape(card(), line(), 18)); summary.addView(text(label(R.string.local_export_contents), 15, true)); gap(summary, 16);
            int notes = data.optInt("notesCount");
            int folders = data.optInt("foldersCount");
            int locked = data.optInt("lockedCount");
            summary.addView(count(label(R.string.local_export_notes), notes)); gap(summary, 14);
            summary.addView(count(label(R.string.local_export_folders), folders)); body.addView(summary); gap(body, 16);
            LinearLayout notice = new LinearLayout(this); notice.setOrientation(LinearLayout.VERTICAL); notice.setPadding(dp(18),dp(18),dp(18),dp(18));
            notice.setBackground(shape(card(), line(), 18)); notice.addView(text(label(R.string.local_export_privacy_title), 15, true)); gap(notice, 8);
            TextView copy = text(label(R.string.backup_export_privacy), 14, false); copy.setTextColor(muted()); notice.addView(copy);
            if (locked > 0) { gap(notice, 10); TextView protectedCopy = text(label(R.string.local_export_locked_notes),14,false); protectedCopy.setTextColor(muted()); notice.addView(protectedCopy); }
            body.addView(notice);
        }
        LinearLayout footer = new LinearLayout(this); footer.setOrientation(LinearLayout.VERTICAL); footer.setPadding(dp(20),dp(12),dp(20),dp(20));
        FrameLayout action = new FrameLayout(this);
        save = new Button(this); save.setText(label(R.string.local_export_save)); save.setTextSize(16); save.setAllCaps(false); save.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        save.setPadding(dp(20),dp(12),dp(20),dp(12)); save.setMinHeight(dp(52)); save.setMinimumHeight(dp(52));
        StateListDrawable background = new StateListDrawable(); background.addState(new int[]{-android.R.attr.state_enabled}, shape(dark?0xff2b3045:0xffd6d6e0,Color.TRANSPARENT,16)); background.addState(new int[]{},shape(BLUE,Color.TRANSPARENT,16));
        save.setBackground(new RippleDrawable(ColorStateList.valueOf(0x33ffffff),background,null));
        save.setTextColor(new ColorStateList(new int[][]{new int[]{-android.R.attr.state_enabled},new int[]{}},new int[]{muted(),Color.WHITE}));
        save.setEnabled(ready); save.setOnClickListener(v -> chooseFile()); action.addView(save, new FrameLayout.LayoutParams(-1,-2));
        progress = new ProgressBar(this); progress.setIndeterminateTintList(ColorStateList.valueOf(Color.WHITE)); progress.setVisibility(View.GONE);
        FrameLayout.LayoutParams progressLayout = new FrameLayout.LayoutParams(dp(20),dp(20),Gravity.START|Gravity.CENTER_VERTICAL); progressLayout.leftMargin=dp(18); action.addView(progress,progressLayout);
        footer.addView(action); gap(footer,12);
        status=text(label(ready?R.string.local_export_ready:R.string.local_export_auth_copy),13,false); status.setTextColor(muted()); status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); footer.addView(status);
        root.addView(footer);
        getWindow().setStatusBarColor(surface()); getWindow().setNavigationBarColor(surface());
        if (Build.VERSION.SDK_INT>=29) getWindow().setNavigationBarContrastEnforced(false);
        WindowInsetsControllerCompat bars=WindowCompat.getInsetsController(getWindow(),root); bars.setAppearanceLightStatusBars(!dark); bars.setAppearanceLightNavigationBars(!dark);
        ViewCompat.requestApplyInsets(root);
    }
    private View count(String label, int value) {
        LinearLayout row = new LinearLayout(this); row.setGravity(Gravity.CENTER_VERTICAL);
        TextView name=text(label,15,false); name.setTextColor(muted()); row.addView(name,new LinearLayout.LayoutParams(0,-2,1)); row.addView(text(String.valueOf(value),17,true)); return row;
    }
    private boolean authorizationValid() {
        return authenticated && android.os.SystemClock.elapsedRealtime() < authorizationUntil;
    }
    private void chooseFile() {
        if (!authenticated || pickerOpen || busy || saved || json==null) return;
        if (!authorizationValid()) { authenticated=false; json=null; save.setEnabled(false); status.setText(label(R.string.local_export_expired)); return; }
        if (confirmation != null && confirmation.isShowing()) return;
        final android.app.Dialog dialog = new android.app.Dialog(this);
        confirmation = dialog;
        dialog.requestWindowFeature(android.view.Window.FEATURE_NO_TITLE);
        ScrollView scroll = new ScrollView(this) {
            @Override protected void onMeasure(int width, int height) {
                super.onMeasure(width, View.MeasureSpec.makeMeasureSpec(
                    (int)(getResources().getDisplayMetrics().heightPixels * 0.8f), View.MeasureSpec.AT_MOST));
            }
        };
        LinearLayout content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(22), dp(18), dp(22), dp(18)); content.setBackground(shape(card(), line(), 24));
        LinearLayout heading = new LinearLayout(this); heading.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = text(label(R.string.backup_export_warning_title), 21, true);
        ViewCompat.setAccessibilityHeading(title, true); heading.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        Button close = warningButton(label(R.string.recovery_close), false);
        close.setTextSize(22); close.setContentDescription(label(R.string.local_export_close));
        close.setOnClickListener(v -> dialog.dismiss()); heading.addView(close, new LinearLayout.LayoutParams(dp(48), dp(48)));
        content.addView(heading); gap(content, 16);
        TextView warning = text(label(R.string.backup_export_warning_copy), 15, false);
        warning.setTextColor(muted()); content.addView(warning); gap(content, 22);
        Button proceed = warningButton(label(R.string.local_export_warning_confirm), true);
        proceed.setEnabled(false);
        proceed.setText(label(R.string.local_export_warning_confirm) + " (5)");
        proceed.setOnClickListener(v -> {
            if (confirmation != dialog || android.os.SystemClock.elapsedRealtime() < confirmationReadyAt) return;
            dialog.dismiss(); openFilePicker();
        });
        content.addView(proceed, new LinearLayout.LayoutParams(-1, -2)); gap(content, 10);
        Button cancel = warningButton(label(R.string.local_export_warning_cancel), false);
        cancel.setOnClickListener(v -> dialog.dismiss()); content.addView(cancel, new LinearLayout.LayoutParams(-1, -2));
        scroll.addView(content); dialog.setContentView(scroll);
        dialog.setCanceledOnTouchOutside(true);
        dialog.setOnDismissListener(ignored -> {
            if (confirmationCountdown != null) { confirmationCountdown.cancel(); confirmationCountdown = null; }
            confirmationReadyAt = 0; confirmation = null;
            if (save != null) save.requestFocus();
        });
        android.view.Window window = dialog.getWindow();
        window.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(Color.TRANSPARENT));
        window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND); window.setDimAmount(0.5f);
        if ((getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0)
            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        dialog.show(); window.setLayout(Math.min(dp(520), (int)(getResources().getDisplayMetrics().widthPixels * 0.9f)), -2);
        confirmationReadyAt = android.os.SystemClock.elapsedRealtime() + 5000;
        confirmationCountdown = new android.os.CountDownTimer(5000, 200) {
            private void update() {
                if (confirmation != dialog || !dialog.isShowing()) return;
                long remaining = Math.max(0, confirmationReadyAt - android.os.SystemClock.elapsedRealtime());
                int seconds = (int)((remaining + 999) / 1000);
                proceed.setText(label(R.string.local_export_warning_confirm) + " (" + seconds + ")");
                proceed.setEnabled(remaining == 0 && authorizationValid());
            }
            @Override public void onTick(long millisUntilFinished) { update(); }
            @Override public void onFinish() { update(); }
        }.start();
    }
    private Button warningButton(String label, boolean primary) {
        Button button = new Button(this); button.setText(label); button.setTextSize(15); button.setAllCaps(false);
        button.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        button.setMinHeight(dp(48)); button.setMinimumHeight(dp(48)); button.setPadding(dp(12), dp(12), dp(12), dp(12));
        button.setTextColor(new ColorStateList(new int[][]{new int[]{-android.R.attr.state_enabled}, new int[]{}},
            new int[]{muted(), primary ? Color.WHITE : ink()}));
        StateListDrawable background = new StateListDrawable();
        background.addState(new int[]{-android.R.attr.state_enabled}, shape(dark ? 0xff2b3045 : 0xffd6d6e0, Color.TRANSPARENT, 14));
        background.addState(new int[]{}, shape(primary ? BLUE : card(), primary ? Color.TRANSPARENT : line(), 14));
        button.setBackground(new RippleDrawable(ColorStateList.valueOf(primary ? 0x33ffffff : 0x222761fc), background, null));
        return button;
    }
    private void openFilePicker() {
        // Confirmation never extends or replaces the fresh credential authorization.
        if (isFinishing() || !authenticated || pickerOpen || busy || saved || json == null) return;
        if (!authorizationValid()) { expireAuthorization.run(); return; }
        pickerOpen=true;
        Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT); intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("application/octet-stream");
        intent.putExtra(Intent.EXTRA_TITLE,"stellar-notes-"+new SimpleDateFormat("yyyy-MM-dd",Locale.ROOT).format(new Date())+".stellarbackup");
        try { startActivityForResult(intent,SAVE); } catch(Exception error) { pickerOpen=false; status.setText(label(R.string.local_export_failed)); }
    }
    @Override protected void onActivityResult(int request,int result,Intent data) {
        super.onActivityResult(request,result,data); if(request!=SAVE)return; pickerOpen=false;
        Uri uri=data==null?null:data.getData();
        if(result!=RESULT_OK || uri==null){finish();return;}
        if(!authorizationValid() || json==null || !"content".equals(uri.getScheme()) || (getPackageName()+".fileprovider").equals(uri.getAuthority())) {status.setText(label(R.string.local_export_failed));return;}
        busy=true; save.setEnabled(false); save.setBackgroundTintList(ColorStateList.valueOf(BLUE)); save.setTextColor(Color.WHITE); save.setText(label(R.string.local_export_saving)); progress.setVisibility(View.VISIBLE); status.setText(label(R.string.local_export_saving));
        byte[] bytes=json.getBytes(StandardCharsets.UTF_8); json=null;
        writer=new Thread(()->{
            boolean success=false;
            try(OutputStream out=getContentResolver().openOutputStream(uri,"w")) {
                if(out==null)throw new java.io.IOException("No destination");
                for(int offset=0;offset<bytes.length;offset+=65536) {if(Thread.currentThread().isInterrupted())throw new java.io.IOException("Cancelled");out.write(bytes,offset,Math.min(65536,bytes.length-offset));}
                out.flush();success=true;
            }catch(Exception error){success=false;}
            java.util.Arrays.fill(bytes,(byte)0);final boolean complete=success;
            runOnUiThread(()->{
                if(isFinishing() || isDestroyed())return;busy=false;progress.setVisibility(View.GONE);
                if(complete){saved=true;json=null;setResult(RESULT_OK);save.setEnabled(true);save.setText(label(R.string.local_export_done));save.setOnClickListener(v->finish());status.setText(label(R.string.local_export_saved));}
                else {authenticated=false;json=null;save.setEnabled(true);save.setText(label(R.string.local_export_done));save.setOnClickListener(v->finish());status.setText(label(R.string.local_export_failed));}
            });
        },"notes-local-export");writer.start();
    }
    @Override protected void onStop() {
        super.onStop();
        // Leaving the export screen ends this authorization. The system document
        // picker is part of the authorized save, not a new export transaction.
        if(authenticated && !pickerOpen && !busy && !isFinishing()) finish();
    }
    @Override protected void onDestroy() {
        if (confirmation != null) confirmation.dismiss();
        expiryHandler.removeCallbacks(expireAuthorization);
        if (screenReceiverRegistered) { unregisterReceiver(screenOff); screenReceiverRegistered = false; }
        if(authentication!=null)authentication.cancel();if(writer!=null)writer.interrupt();
        LocalExportPayload.discard(payloadId);json=null;super.onDestroy();
    }
}
