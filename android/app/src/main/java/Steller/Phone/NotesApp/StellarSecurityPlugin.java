package Steller.Phone.NotesApp;

import android.net.Uri;
import android.app.Activity;
import android.content.Intent;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.annotation.ActivityCallback;
import java.io.OutputStream;
import android.view.HapticFeedbackConstants;
import com.getcapacitor.Plugin;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Block document navigation through Capacitor's internal HTTP proxy. */
@CapacitorPlugin(name = "StellarSecurity")
public class StellarSecurityPlugin extends Plugin {
    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        String path = url == null ? null : url.getPath();
        return path != null && path.startsWith("/_capacitor_http_interceptor_")
                ? Boolean.TRUE : null;
    }

    @PluginMethod
    public void appearance(PluginCall call) {
        String theme = call.getString("theme");
        String overlay = call.getString("overlay");
        if (!("light".equals(theme) || "dark".equals(theme))
            || !("none".equals(overlay) || "modal".equals(overlay) || "popover".equals(overlay))) {
            call.reject("Invalid appearance");
            return;
        }
        getActivity().runOnUiThread(() -> {
            ((MainActivity) getActivity()).updateAppearance("dark".equals(theme), overlay);
            call.resolve();
        });
    }

    @PluginMethod
    public void screenProtectionStatus(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject result = new JSObject();
            result.put("enabled", ((MainActivity) getActivity()).isScreenProtectionEnabled());
            call.resolve(result);
        });
    }

    @PluginMethod
    public void setScreenProtection(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) { call.reject("Invalid screen protection setting"); return; }
        getActivity().runOnUiThread(() -> {
            MainActivity activity = (MainActivity) getActivity();
            if (!activity.setScreenProtectionEnabled(enabled)) {
                call.reject("Screen protection setting could not be saved");
                return;
            }
            JSObject result = new JSObject();
            result.put("enabled", activity.isScreenProtectionEnabled());
            call.resolve(result);
        });
    }

    @PluginMethod
    public void selectionFeedback(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject result = new JSObject();
            result.put("performed", getBridge().getWebView().performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK));
            call.resolve(result);
        });
    }

    @PluginMethod
    public void errorFeedback(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            int feedback = android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R
                ? HapticFeedbackConstants.REJECT : HapticFeedbackConstants.LONG_PRESS;
            JSObject result = new JSObject();
            result.put("performed", getBridge().getWebView().performHapticFeedback(feedback));
            call.resolve(result);
        });
    }

    @PluginMethod
    public void resetLocalApp(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            android.app.ActivityManager manager = (android.app.ActivityManager)
                getContext().getSystemService(android.content.Context.ACTIVITY_SERVICE);
            if (manager == null || !manager.clearApplicationUserData()) {
                call.reject("App reset failed");
            }
        });
    }

    @PluginMethod
    public void saveImage(PluginCall call) {
        String data = call.getString("dataUrl", "");
        int comma = data.indexOf(',');
        if (data.length() > 7 * 1024 * 1024 || comma < 0) {
            call.reject("Invalid image");
            return;
        }
        String header = data.substring(0, comma);
        String mime;
        String extension;
        switch (header) {
            case "data:image/png;base64": mime = "image/png"; extension = "png"; break;
            case "data:image/jpeg;base64": mime = "image/jpeg"; extension = "jpg"; break;
            case "data:image/webp;base64": mime = "image/webp"; extension = "webp"; break;
            default: call.reject("Invalid image"); return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, "stellar-note-image." + extension);
        startActivityForResult(call, intent, "imageSaveResult");
    }

    @ActivityCallback
    private void imageSaveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            JSObject response = new JSObject();
            response.put("saved", false);
            call.resolve(response);
            return;
        }
        Uri destination = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || destination == null) {
            call.reject("Image save failed");
            return;
        }
        getBridge().execute(() -> {
            try {
                String data = call.getString("dataUrl", "");
                byte[] bytes = Base64.decode(data.substring(data.indexOf(',') + 1), Base64.DEFAULT);
                if (bytes.length == 0 || bytes.length > 5 * 1024 * 1024) throw new IllegalArgumentException("Invalid image");
                try (OutputStream output = getContext().getContentResolver().openOutputStream(destination, "w")) {
                    if (output == null) throw new IllegalStateException("Image destination unavailable");
                    output.write(bytes);
                    output.flush();
                }
                JSObject response = new JSObject();
                response.put("saved", true);
                call.resolve(response);
            } catch (Exception error) {
                call.reject("Image save failed");
            }
        });
    }

    private JSObject biometricState(BiometricScreenLock lock, boolean cancelled) {
        JSObject result = new JSObject();
        result.put("available", lock.availability() == 0);
        result.put("enabled", lock.enabled());
        result.put("cancelled", cancelled);
        result.put("status", lock.availability());
        return result;
    }

    @PluginMethod
    public void biometricStatus(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            BiometricScreenLock lock = ((MainActivity) getActivity()).biometricScreenLock();
            if (lock == null) { call.reject("biometricUnavailable"); return; }
            call.resolve(biometricState(lock, false));
        });
    }

    @PluginMethod
    public void setBiometricLock(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) { call.reject("Invalid biometric setting"); return; }
        getActivity().runOnUiThread(() -> {
            BiometricScreenLock lock = ((MainActivity) getActivity()).biometricScreenLock();
            if (lock == null) { call.reject("biometricUnavailable"); return; }
            if (enabled == lock.enabled()) { call.resolve(biometricState(lock, false)); return; }
            if (enabled && lock.availability() != 0) {
                call.reject(lock.availability() == 11 ? "biometricNotEnrolled" : "biometricUnavailable");
                return;
            }
            lock.change(enabled, success -> call.resolve(biometricState(lock, !success)));
        });
    }

    @PluginMethod
    public void analyticsPolicy(PluginCall call) {
        JSObject result = new JSObject();
        result.put("allowed", AnalyticsPolicy.isAllowed(getContext()));
        call.resolve(result);
    }
}
