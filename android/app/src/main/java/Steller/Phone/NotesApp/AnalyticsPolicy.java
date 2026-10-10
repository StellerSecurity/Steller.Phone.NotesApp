package Steller.Phone.NotesApp;

import android.content.Context;
import android.content.pm.PackageManager;

/** Device identity for privacy decisions only, never for privilege checks. */
public final class AnalyticsPolicy {
    private AnalyticsPolicy() {}

    public static boolean isAllowed(Context context) {
        if (context == null) return false;
        try {
            return !"android".equals(context.getPackageManager().getPermissionInfo(
                    "stellar.permission.MANAGE_STELLAR_FEATURE", 0).packageName);
        } catch (PackageManager.NameNotFoundException ordinaryAndroid) {
            return true;
        } catch (RuntimeException unavailable) {
            // If device identity cannot be checked, do not start tracking.
            return false;
        }
    }
}
