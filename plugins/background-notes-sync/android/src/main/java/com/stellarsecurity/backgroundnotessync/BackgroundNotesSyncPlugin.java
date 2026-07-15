package com.stellarsecurity.backgroundnotessync;

import android.content.Context;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "BackgroundNotesSync")
public class BackgroundNotesSyncPlugin extends Plugin {
    private static final String PERIODIC_WORK = "stellar-notes-background-sync-periodic";
    private static final String IMMEDIATE_WORK = "stellar-notes-background-sync-immediate";

    @Override
    public void load() {
        schedulePeriodic(getContext());
    }

    @PluginMethod
    public void replaceQueue(PluginCall call) {
        try {
            JSArray operations = call.getArray("operations", new JSArray());
            String uploadUrl = call.getString("uploadUrl");
            String syncPlanUrl = call.getString("syncPlanUrl");
            if (uploadUrl == null || syncPlanUrl == null) {
                call.reject("Missing sync endpoint");
                return;
            }

            getContext().getSharedPreferences(BackgroundNotesSyncStore.PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(BackgroundNotesSyncStore.UPLOAD_URL, uploadUrl)
                .putString(BackgroundNotesSyncStore.SYNC_PLAN_URL, syncPlanUrl)
                .apply();
            BackgroundNotesSyncStore.replaceQueue(getContext(), operations);
            schedulePeriodic(getContext());
            if (operations.length() > 0) scheduleImmediate(getContext());
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to persist background sync queue", error);
        }
    }

    @PluginMethod
    public void consumeCompleted(PluginCall call) {
        JSObject result = new JSObject();
        result.put("opIds", BackgroundNotesSyncStore.consumeCompleted(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void configurePull(PluginCall call) {
        String downloadUrl = call.getString("downloadUrl");
        if (downloadUrl == null || downloadUrl.isEmpty()) {
            call.reject("Missing download endpoint");
            return;
        }
        getContext().getSharedPreferences(BackgroundNotesSyncStore.PREFS, Context.MODE_PRIVATE)
            .edit().putString(BackgroundNotesSyncStore.DOWNLOAD_URL, downloadUrl).apply();
        schedulePeriodic(getContext());
        call.resolve();
    }

    @PluginMethod
    public void consumeDownloaded(PluginCall call) {
        JSObject result = new JSObject();
        result.put("responses", BackgroundNotesSyncStore.consumeDownloaded(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void clearDownloaded(PluginCall call) {
        BackgroundNotesSyncStore.clearDownloaded(getContext());
        getContext().getSharedPreferences(BackgroundNotesSyncStore.PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(BackgroundNotesSyncStore.PULL_WATERMARK)
            .remove(BackgroundNotesSyncStore.PULL_USER)
            .apply();
        call.resolve();
    }

    private static Constraints networkConstraints() {
        return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    }

    private static void schedulePeriodic(Context context) {
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
            BackgroundNotesSyncWorker.class, 15, TimeUnit.MINUTES
        ).setConstraints(networkConstraints()).build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC_WORK, ExistingPeriodicWorkPolicy.KEEP, request
        );
    }

    private static void scheduleImmediate(Context context) {
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(BackgroundNotesSyncWorker.class)
            .setConstraints(networkConstraints())
            .setInitialDelay(10, TimeUnit.SECONDS)
            .build();
        WorkManager.getInstance(context).enqueueUniqueWork(
            IMMEDIATE_WORK, ExistingWorkPolicy.REPLACE, request
        );
    }
}
