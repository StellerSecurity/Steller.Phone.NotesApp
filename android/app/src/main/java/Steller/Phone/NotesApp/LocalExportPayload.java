package Steller.Phone.NotesApp;

import java.util.UUID;

/** A single export stays in app memory only; no notes enter Android Intent extras. */
final class LocalExportPayload {
    private static String id;
    private static String value;
    private static long expires;
    private LocalExportPayload() {}
    static synchronized String offer(String json) {
        if (value != null && android.os.SystemClock.elapsedRealtime() < expires) return null;
        id = UUID.randomUUID().toString(); value = json;
        expires = android.os.SystemClock.elapsedRealtime() + 120000;
        return id;
    }
    static synchronized long deadline(String expected) {
        return id != null && id.equals(expected) ? expires : 0;
    }
    static synchronized String take(String expected) {
        if (id == null || !id.equals(expected)) return null;
        String result = android.os.SystemClock.elapsedRealtime() < expires ? value : null;
        id = null; value = null; expires = 0;
        return result;
    }
    static synchronized void discard(String expected) {
        if (id != null && id.equals(expected)) { id = null; value = null; expires = 0; }
    }
}
