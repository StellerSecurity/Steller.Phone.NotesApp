package Steller.Phone.NotesApp;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.view.View;
import android.view.WindowManager;
import android.widget.*;
import androidx.core.view.*;
import java.io.*;
import java.security.*;
import java.security.spec.X509EncodedKeySpec;
import java.util.UUID;

/** Recovery-only launcher: intentionally never initializes Capacitor or WebView. */
public final class RecoveryActivity extends Activity {
    private static final int SAVE = 4201;
    private Button export;
    private CheckBox disclosure, consent;
    private TextView status;
    private ProgressBar progress;
    private File pending;
    private Thread worker;
    private boolean busy;

    private int dp(int value) { return Math.round(value*getResources().getDisplayMetrics().density); }
    private TextView text(int resource,int size) {
        TextView v=new TextView(this); v.setText(resource); v.setTextSize(size); v.setTextColor(Color.rgb(11,12,25));
        v.setPadding(0,dp(10),0,dp(10)); return v;
    }
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        LinearLayout page=new LinearLayout(this); page.setOrientation(LinearLayout.VERTICAL);
        page.setBackgroundColor(Color.rgb(246,246,253));
        ScrollView scroll=new ScrollView(this); scroll.setFillViewport(true); scroll.addView(page); setContentView(scroll);
        ViewCompat.setOnApplyWindowInsetsListener(scroll,(v,insets)->{
            androidx.core.graphics.Insets bars=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout());
            page.setPadding(dp(24)+bars.left,dp(12)+bars.top,dp(24)+bars.right,dp(20)+bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        Button close=new Button(this); close.setText(R.string.recovery_close); close.setContentDescription(getString(R.string.recovery_close_description));
        close.setOnClickListener(v->finish());
        LinearLayout.LayoutParams closeLayout=new LinearLayout.LayoutParams(dp(48),dp(48));
        closeLayout.gravity=android.view.Gravity.END; page.addView(close,closeLayout);
        page.addView(text(R.string.recovery_title,26));
        page.addView(text(R.string.recovery_intro,16));
        page.addView(text(R.string.recovery_password_notice,16));
        disclosure=new CheckBox(this); disclosure.setText(R.string.recovery_disclosure); disclosure.setTextSize(16); disclosure.setTextColor(Color.rgb(11,12,25)); page.addView(disclosure);
        consent=new CheckBox(this); consent.setText(R.string.recovery_consent); consent.setTextSize(16); consent.setTextColor(Color.rgb(11,12,25)); page.addView(consent);
        disclosure.setOnCheckedChangeListener((b,c)->update()); consent.setOnCheckedChangeListener((b,c)->update());
        export=new Button(this); export.setText(R.string.recovery_export); export.setTextSize(16);
        export.setOnClickListener(v->prepare()); page.addView(export);
        progress=new ProgressBar(this); progress.setVisibility(View.GONE); page.addView(progress);
        status=text(R.string.recovery_ready,16); status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); page.addView(status);
        getWindow().setStatusBarColor(Color.rgb(246,246,253));
        getWindow().setNavigationBarColor(Color.rgb(246,246,253));
        WindowInsetsControllerCompat bars=WindowCompat.getInsetsController(getWindow(),scroll);
        bars.setAppearanceLightStatusBars(true); bars.setAppearanceLightNavigationBars(true);
        update();
    }
    private void update() { if(export!=null) export.setEnabled(!busy && disclosure.isChecked() && consent.isChecked()); }
    private void state(boolean value,int message) {
        busy=value; status.setText(message); progress.setVisibility(value?View.VISIBLE:View.GONE);
        disclosure.setEnabled(!value); consent.setEnabled(!value); update();
    }
    private void prepare() {
        if(busy || !disclosure.isChecked() || !consent.isChecked()) return;
        state(true,R.string.recovery_preparing);
        worker=new Thread(()->{
            try {
                byte[] publicBytes;
                try(InputStream in=getAssets().open("recovery-support-public.der"); ByteArrayOutputStream bytes=new ByteArrayOutputStream()) {
                    byte[] b=new byte[4096]; int n; while((n=in.read(b))!=-1) bytes.write(b,0,n); publicBytes=bytes.toByteArray();
                }
                PublicKey key=KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(publicBytes));
                File output=new File(getCacheDir(),"notes-recovery-"+UUID.randomUUID()+".stnrecovery");
                RecoveryArchive.create(new File(getApplicationInfo().dataDir),output,key,UUID.randomUUID().toString());
                if(isFinishing() || Thread.currentThread().isInterrupted()) { output.delete(); return; }
                pending=output;
                runOnUiThread(()->{
                    if(isFinishing()) { cleanup(); return; }
                    Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    save.addCategory(Intent.CATEGORY_OPENABLE); save.setType("application/octet-stream");
                    save.putExtra(Intent.EXTRA_TITLE,"stellar-notes-recovery.stnrecovery");
                    try { startActivityForResult(save,SAVE); }
                    catch(Exception e) { cleanup(); state(false,R.string.recovery_failed); }
                });
            } catch(Exception e) {
                cleanup(); runOnUiThread(()->{if(!isFinishing()) state(false,R.string.recovery_failed);});
            }
        },"notes-recovery-export");
        worker.start();
    }
    @Override protected void onActivityResult(int request,int result,Intent data) {
        super.onActivityResult(request,result,data);
        if(request!=SAVE) return;
        Uri uri=data==null?null:data.getData();
        if(result!=RESULT_OK || uri==null || pending==null) { cleanup(); state(false,R.string.recovery_cancelled); return; }
        // Never let a returned file:// URI overwrite app-owned storage.
        if(!"content".equals(uri.getScheme()) || (getPackageName()+".fileprovider").equals(uri.getAuthority())) {
            cleanup(); state(false,R.string.recovery_save_failed); return;
        }
        state(true,R.string.recovery_saving);
        File ready=pending;
        worker=new Thread(()->{
            boolean success=false;
            try(InputStream in=new FileInputStream(ready); OutputStream out=getContentResolver().openOutputStream(uri,"w")) {
                if(out==null) throw new IOException("No destination");
                byte[] b=new byte[65536]; int n;
                while((n=in.read(b))!=-1) { if(Thread.currentThread().isInterrupted()) throw new IOException("Cancelled"); out.write(b,0,n); }
                out.flush(); success=true;
            } catch(Exception e) { success=false; }
            cleanup(); final boolean saved=success;
            runOnUiThread(()->{ if(!isFinishing()) state(false,saved?R.string.recovery_saved:R.string.recovery_save_failed); });
        },"notes-recovery-save"); worker.start();
    }
    private synchronized void cleanup() { if(pending!=null) { pending.delete(); pending=null; } }
    @Override protected void onDestroy() {
        if(worker!=null) worker.interrupt(); cleanup(); super.onDestroy();
    }
}
