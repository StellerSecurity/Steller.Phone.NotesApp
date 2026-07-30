package com.stellarsecurity.backgroundnotessync;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.whitestein.securestorage.PasswordStorageHelper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

public class BackgroundNotesSyncWorker extends Worker {
    private static final String TAG = "BackgroundNotesSync";

    public BackgroundNotesSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            byte[] tokenBytes = new PasswordStorageHelper(getApplicationContext()).getData("ssToken");
            if (tokenBytes == null || tokenBytes.length == 0) {
                recordPullResult("skipped_no_token", 0, 0, 0, 0);
                Log.i(TAG, "Background pull skipped: user is not logged in");
                return Result.success();
            }
            String token = new String(tokenBytes, StandardCharsets.UTF_8);

            SharedPreferences preferences = getApplicationContext().getSharedPreferences(
                BackgroundNotesSyncStore.PREFS, Context.MODE_PRIVATE
            );
            String uploadUrl = preferences.getString(BackgroundNotesSyncStore.UPLOAD_URL, null);
            String syncPlanUrl = preferences.getString(BackgroundNotesSyncStore.SYNC_PLAN_URL, null);
            String downloadUrl = preferences.getString(BackgroundNotesSyncStore.DOWNLOAD_URL, null);

            JSONArray queue = BackgroundNotesSyncStore.readQueue(getApplicationContext());
            long now = System.currentTimeMillis();

            for (int i = 0; uploadUrl != null && syncPlanUrl != null && i < queue.length(); i++) {
                JSONObject operation = queue.optJSONObject(i);
                if (operation == null || operation.optLong("nextAt", 0) > now) continue;

                boolean uploaded = send(operation, token, uploadUrl, syncPlanUrl);
                int attempt = operation.optInt("attempt", 0) + (uploaded ? 0 : 1);
                BackgroundNotesSyncStore.updateAfterAttempt(
                    getApplicationContext(),
                    operation.optString("opId"),
                    uploaded,
                    attempt,
                    System.currentTimeMillis() + backoffMs(attempt)
                );
            }
            if (downloadUrl != null) {
                pull(token, downloadUrl, preferences);
            } else {
                recordPullResult("skipped_no_download_url", 0, 0, 0, 0);
                Log.w(TAG, "Background pull skipped: download URL is not configured");
            }
            return Result.success();
        } catch (Exception error) {
            recordPullResult("worker_error_" + error.getClass().getSimpleName(), 0, 0, 0, 0);
            Log.e(TAG, "Background sync worker failed", error);
            return Result.retry();
        }
    }

    private void pull(String token, String endpoint, SharedPreferences preferences) {
        HttpURLConnection connection = null;
        try {
            Log.i(TAG, "Background pull started");
            String userMarker = tokenMarker(token);
            if (!userMarker.equals(preferences.getString(BackgroundNotesSyncStore.PULL_USER, ""))) {
                preferences.edit()
                    .putString(BackgroundNotesSyncStore.PULL_USER, userMarker)
                    .putLong(BackgroundNotesSyncStore.PULL_WATERMARK, 0)
                    .apply();
                BackgroundNotesSyncStore.clearDownloaded(getApplicationContext());
            }

            long since = preferences.getLong(BackgroundNotesSyncStore.PULL_WATERMARK, 0);
            JSONObject body = new JSONObject();
            body.put("since", since);
            body.put("limit", 1000);
            connection = (HttpURLConnection) new URL(endpoint).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(20_000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Authorization", "Bearer " + token);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Accept", "application/json");
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                recordPullResult("http_error", status, 0, 0, since);
                Log.w(TAG, "Background pull returned HTTP " + status);
                return;
            }
            InputStream input = connection.getInputStream();
            byte[] data;
            try (java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                data = output.toByteArray();
            }
            JSONObject response = new JSONObject(new String(data, StandardCharsets.UTF_8));
            JSONArray notes = response.optJSONArray("notes");
            JSONArray folders = response.optJSONArray("folders");
            int noteCount = notes == null ? 0 : notes.length();
            int folderCount = folders == null ? 0 : folders.length();
            if (noteCount > 0 || folderCount > 0) {
                BackgroundNotesSyncStore.stageDownloaded(getApplicationContext(), response);
            }
            long watermark = response.optLong("watermark", since);
            if (watermark > since) preferences.edit().putLong(BackgroundNotesSyncStore.PULL_WATERMARK, watermark).apply();
            recordPullResult("success", status, noteCount, folderCount, watermark);
            Log.i(TAG, "Background pull succeeded: notes=" + noteCount
                + ", folders=" + folderCount + ", watermark=" + watermark);
        } catch (Exception error) {
            recordPullResult("network_error_" + error.getClass().getSimpleName(), 0, 0, 0, 0);
            Log.e(TAG, "Background pull failed", error);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void recordPullResult(
        String result,
        int httpStatus,
        int noteCount,
        int folderCount,
        long watermark
    ) {
        getApplicationContext().getSharedPreferences(
            BackgroundNotesSyncStore.PREFS, Context.MODE_PRIVATE
        ).edit()
            .putLong("last_pull_at", System.currentTimeMillis())
            .putString("last_pull_result", result)
            .putInt("last_pull_http_status", httpStatus)
            .putInt("last_pull_note_count", noteCount)
            .putInt("last_pull_folder_count", folderCount)
            .putLong("last_pull_response_watermark", watermark)
            .apply();
    }

    private String tokenMarker(String token) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder();
        for (byte value : digest) result.append(String.format("%02x", value));
        return result.toString();
    }

    private boolean send(JSONObject operation, String token, String uploadUrl, String syncPlanUrl) {
        HttpURLConnection connection = null;
        try {
            boolean isDelete = "delete".equals(operation.optString("type"));
            JSONObject payload = operation.optJSONObject("payload");
            if (payload == null) return true;

            JSONObject body = payload;
            String endpoint = uploadUrl;
            if (isDelete) {
                endpoint = syncPlanUrl;
                body = new JSONObject();
                body.put("deleted_ids", payload.optJSONArray("deleted_ids") != null
                    ? payload.optJSONArray("deleted_ids") : new JSONArray());
                body.put("notes", new JSONArray());
            }

            connection = (HttpURLConnection) new URL(endpoint).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(15_000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Authorization", "Bearer " + token);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Accept", "application/json");

            try (OutputStream output = connection.getOutputStream()) {
                output.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }

            int status = connection.getResponseCode();
            InputStream response = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (response != null) response.close();
            return status >= 200 && status < 300;
        } catch (Exception ignored) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private long backoffMs(int attempt) {
        int exponent = Math.max(0, Math.min(attempt - 1, 12));
        return Math.min(60L * 60L * 1000L, 1000L * (1L << exponent));
    }
}
