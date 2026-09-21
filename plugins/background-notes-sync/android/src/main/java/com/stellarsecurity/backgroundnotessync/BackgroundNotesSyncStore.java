package com.stellarsecurity.backgroundnotessync;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;

final class BackgroundNotesSyncStore {
    static final String PREFS = "stellar_background_notes_sync";
    static final String UPLOAD_URL = "upload_url";
    static final String SYNC_PLAN_URL = "sync_plan_url";
    static final String DOWNLOAD_URL = "download_url";
    static final String PULL_WATERMARK = "pull_watermark";
    static final String PULL_USER = "pull_user";
    private static final String QUEUE_FILE = "stellar-notes-background-outbox.json";
    private static final String INBOX_FILE = "stellar-notes-background-inbox.json";
    private static final String COMPLETED = "completed_op_ids";
    private static final int MAX_COMPLETED_IDS = 500;

    private BackgroundNotesSyncStore() {}

    static synchronized JSONArray readQueue(Context context) {
        try {
            File file = new File(context.getNoBackupFilesDir(), QUEUE_FILE);
            if (!file.exists()) return new JSONArray();
            try (FileInputStream input = new FileInputStream(file);
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                return new JSONArray(new String(output.toByteArray(), StandardCharsets.UTF_8));
            }
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }

    static synchronized void replaceQueue(Context context, JSONArray incoming) throws Exception {
        Set<String> completed = completedIds(context);
        JSONArray filtered = new JSONArray();
        for (int i = 0; i < incoming.length(); i++) {
            JSONObject operation = incoming.optJSONObject(i);
            if (operation == null) continue;
            if (!completed.contains(operation.optString("opId"))) filtered.put(operation);
        }
        writeQueue(context, filtered);
    }

    static synchronized void writeQueue(Context context, JSONArray queue) throws Exception {
        File directory = context.getNoBackupFilesDir();
        File target = new File(directory, QUEUE_FILE);
        File temporary = new File(directory, QUEUE_FILE + ".tmp");
        writeFile(temporary, queue.toString());
        if (!temporary.renameTo(target)) {
            writeFile(target, queue.toString());
            //noinspection ResultOfMethodCallIgnored
            temporary.delete();
        }
    }

    static synchronized void updateAfterAttempt(
        Context context,
        String opId,
        boolean success,
        int attempt,
        long nextAt
    ) throws Exception {
        JSONArray current = readQueue(context);
        JSONArray next = new JSONArray();
        for (int i = 0; i < current.length(); i++) {
            JSONObject operation = current.optJSONObject(i);
            if (operation == null) continue;
            if (!opId.equals(operation.optString("opId"))) {
                next.put(operation);
                continue;
            }
            if (success) {
                markCompleted(context, opId);
            } else {
                operation.put("attempt", attempt);
                operation.put("nextAt", nextAt);
                next.put(operation);
            }
        }
        writeQueue(context, next);
    }

    static synchronized JSONArray consumeCompleted(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray result;
        try {
            result = new JSONArray(preferences.getString(COMPLETED, "[]"));
        } catch (Exception ignored) {
            result = new JSONArray();
        }
        preferences.edit().remove(COMPLETED).apply();
        return result;
    }

    private static DownloadAccumulator<JSONObject> records(JSONArray responses, String field) {
        DownloadAccumulator<JSONObject> result = new DownloadAccumulator<>(
            item -> item.optString("id", ""),
            item -> item.optLong("last_modified", 0),
            item -> item.optBoolean("deleted", false)
        );
        for (int i = 0; i < responses.length(); i++) {
            JSONObject response = responses.optJSONObject(i);
            JSONArray items = response == null ? null : response.optJSONArray(field);
            if (items == null) continue;
            for (int j = 0; j < items.length(); j++) result.add(items.optJSONObject(j));
        }
        return result;
    }

    private static JSONArray compactDownloaded(JSONArray responses) throws Exception {
        if (responses.length() == 0) return responses;
        JSONObject merged = new JSONObject();
        merged.put("notes", new JSONArray(records(responses, "notes").values()));
        merged.put("folders", new JSONArray(records(responses, "folders").values()));
        long watermark = 0;
        boolean hasMore = false;
        for (int i = 0; i < responses.length(); i++) {
            JSONObject response = responses.optJSONObject(i);
            if (response == null) continue;
            watermark = Math.max(watermark, response.optLong("watermark", 0));
            hasMore |= response.optBoolean("has_more", false);
        }
        merged.put("watermark", watermark);
        merged.put("has_more", hasMore);
        return new JSONArray().put(merged);
    }

    static synchronized JSONObject prepareDownload(Context context, String userMarker) throws Exception {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!userMarker.equals(preferences.getString(PULL_USER, ""))) {
            // Clear the old account before recording the new marker; fail closed on disk errors.
            writeArrayFile(context, INBOX_FILE, new JSONArray());
            preferences.edit().putString(PULL_USER, userMarker).putLong(PULL_WATERMARK, 0).apply();
        }
        // Only advertise records still durably staged. Consumption or missing/corrupt
        // cache automatically falls back to a full pull, without a separate stale cursor.
        return new JSONObject(records(readArrayFile(context, INBOX_FILE), "notes").knownVersions());
    }

    static synchronized boolean stageDownloaded(Context context, JSONObject response, String userMarker) throws Exception {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        // Ignore an in-flight response from a session cleared by logout/account switching.
        if (!userMarker.equals(preferences.getString(PULL_USER, ""))) return false;
        JSONArray responses = readArrayFile(context, INBOX_FILE);
        String previous = responses.toString();
        responses.put(response);
        JSONArray compacted = compactDownloaded(responses);
        if (!previous.equals(compacted.toString())) writeArrayFile(context, INBOX_FILE, compacted);
        long watermark = response.optLong("watermark", 0);
        if (watermark > preferences.getLong(PULL_WATERMARK, 0)) {
            preferences.edit().putLong(PULL_WATERMARK, watermark).apply();
        }
        return true;
    }

    static synchronized JSONArray consumeDownloaded(Context context) {
        // A failed disk clear at logout must not expose the old account's inbox.
        if (context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PULL_USER, "").isEmpty()) {
            return new JSONArray();
        }
        JSONArray responses = readArrayFile(context, INBOX_FILE);
        try {
            JSONArray compacted = compactDownloaded(responses);
            writeArrayFile(context, INBOX_FILE, new JSONArray());
            return compacted;
        } catch (Exception ignored) {
            // Preserve the original inbox if compaction or clearing fails.
            return responses;
        }
    }

    static synchronized void clearDownloaded(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .remove(PULL_USER).remove(PULL_WATERMARK).apply();
        try { writeArrayFile(context, INBOX_FILE, new JSONArray()); } catch (Exception ignored) {}
    }

    private static JSONArray readArrayFile(Context context, String filename) {
        try {
            File file = new File(context.getNoBackupFilesDir(), filename);
            if (!file.exists()) return new JSONArray();
            try (FileInputStream input = new FileInputStream(file);
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                return new JSONArray(new String(output.toByteArray(), StandardCharsets.UTF_8));
            }
        } catch (Exception ignored) { return new JSONArray(); }
    }

    private static void writeArrayFile(Context context, String filename, JSONArray values) throws Exception {
        File directory = context.getNoBackupFilesDir();
        File target = new File(directory, filename);
        File temporary = new File(directory, filename + ".tmp");
        writeFile(temporary, values.toString());
        if (!temporary.renameTo(target)) {
            writeFile(target, values.toString());
            //noinspection ResultOfMethodCallIgnored
            temporary.delete();
        }
    }

    private static void writeFile(File file, String value) throws Exception {
        try (FileOutputStream output = new FileOutputStream(file, false)) {
            output.write(value.getBytes(StandardCharsets.UTF_8));
            output.getFD().sync();
        }
    }

    private static void markCompleted(Context context, String opId) {
        if (opId == null || opId.isEmpty()) return;
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray current;
        try {
            current = new JSONArray(preferences.getString(COMPLETED, "[]"));
        } catch (Exception ignored) {
            current = new JSONArray();
        }

        JSONArray next = new JSONArray();
        int start = Math.max(0, current.length() - (MAX_COMPLETED_IDS - 1));
        for (int i = start; i < current.length(); i++) next.put(current.optString(i));
        next.put(opId);
        preferences.edit().putString(COMPLETED, next.toString()).apply();
    }

    private static Set<String> completedIds(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        Set<String> ids = new HashSet<>();
        try {
            JSONArray values = new JSONArray(preferences.getString(COMPLETED, "[]"));
            for (int i = 0; i < values.length(); i++) ids.add(values.optString(i));
        } catch (Exception ignored) {}
        return ids;
    }
}
