import Foundation
import BackgroundTasks
import Security
import UIKit
import CryptoKit

public enum BackgroundNotesSyncProcessor {
    public static let taskIdentifier = "steller.phone.notesapp.background-sync"
    private static let queue = DispatchQueue(label: "steller.phone.notesapp.background-sync-store")
    private static let queueFilename = "stellar-notes-background-outbox.json"
    private static let inboxFilename = "stellar-notes-background-inbox.json"
    private static let completedKey = "stellar_notes_background_completed_ids"
    private static let uploadURLKey = "stellar_notes_background_upload_url"
    private static let syncPlanURLKey = "stellar_notes_background_sync_plan_url"
    private static let downloadURLKey = "stellar_notes_background_download_url"
    private static let pullWatermarkKey = "stellar_notes_background_pull_watermark"
    private static let pullUserKey = "stellar_notes_background_pull_user"
    private static let lastPullAtKey = "stellar_notes_background_last_pull_at"
    private static let lastPullResultKey = "stellar_notes_background_last_pull_result"
    private static let lastPullHTTPStatusKey = "stellar_notes_background_last_pull_http_status"
    private static let lastPullNoteCountKey = "stellar_notes_background_last_pull_note_count"
    private static let lastPullFolderCountKey = "stellar_notes_background_last_pull_folder_count"
    private static let maximumCompletedIDs = 500
    private static var expirationRequested = false
    private static var registered = false

    public static func register() {
        guard !registered else { return }
        registered = BGTaskScheduler.shared.register(
            forTaskWithIdentifier: taskIdentifier,
            using: nil
        ) { task in
            guard let processingTask = task as? BGProcessingTask else {
                task.setTaskCompleted(success: false)
                return
            }
            handle(processingTask)
        }
    }

    static func replaceQueue(operations: [[String: Any]], uploadURL: String, syncPlanURL: String) throws {
        try queue.sync {
            UserDefaults.standard.set(uploadURL, forKey: uploadURLKey)
            UserDefaults.standard.set(syncPlanURL, forKey: syncPlanURLKey)
            let completed = Set(UserDefaults.standard.stringArray(forKey: completedKey) ?? [])
            let filtered = operations.filter {
                guard let opID = $0["opId"] as? String else { return false }
                return !completed.contains(opID)
            }
            try saveQueueUnlocked(filtered)
        }
    }

    static func consumeCompleted() -> [String] {
        queue.sync {
            let ids = UserDefaults.standard.stringArray(forKey: completedKey) ?? []
            UserDefaults.standard.removeObject(forKey: completedKey)
            return ids
        }
    }

    static func configurePull(downloadURL: String) {
        UserDefaults.standard.set(downloadURL, forKey: downloadURLKey)
    }

    static func consumeDownloaded() -> [[String: Any]] {
        queue.sync {
            let responses = loadInboxUnlocked()
            try? saveInboxUnlocked([])
            return responses
        }
    }

    static func clearDownloaded() {
        queue.sync { try? saveInboxUnlocked([]) }
        UserDefaults.standard.removeObject(forKey: pullWatermarkKey)
        UserDefaults.standard.removeObject(forKey: pullUserKey)
    }

    static func schedule() {
        let hasWork = queue.sync { !loadQueueUnlocked().isEmpty }
            || UserDefaults.standard.string(forKey: downloadURLKey) != nil
        guard hasWork else { return }
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: taskIdentifier)
        let request = BGProcessingTaskRequest(identifier: taskIdentifier)
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    static func runBackgroundGracePeriod() {
        let hasWork = queue.sync { !loadQueueUnlocked().isEmpty }
            || UserDefaults.standard.string(forKey: downloadURLKey) != nil
        guard hasWork else { return }

        var backgroundTask: UIBackgroundTaskIdentifier = .invalid
        backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "Stellar Notes sync") {
            expirationRequested = true
            if backgroundTask != .invalid {
                UIApplication.shared.endBackgroundTask(backgroundTask)
                backgroundTask = .invalid
            }
        }
        expirationRequested = false
        processQueue {
            schedule()
            DispatchQueue.main.async {
                if backgroundTask != .invalid {
                    UIApplication.shared.endBackgroundTask(backgroundTask)
                    backgroundTask = .invalid
                }
            }
        }
    }

    private static func handle(_ task: BGProcessingTask) {
        expirationRequested = false
        task.expirationHandler = { expirationRequested = true }
        processQueue {
            schedule()
            task.setTaskCompleted(success: !expirationRequested)
        }
    }

    private static func processQueue(completion: @escaping () -> Void) {
        guard let token = secureToken(), !token.isEmpty else {
            recordPullResult("skipped_no_token")
            NSLog("BackgroundNotesSync: background pull skipped because the user is not logged in")
            completion()
            return
        }
        let pullThenComplete = {
            pull(token: token, completion: completion)
        }
        guard
            let uploadURL = UserDefaults.standard.string(forKey: uploadURLKey),
            let syncPlanURL = UserDefaults.standard.string(forKey: syncPlanURLKey)
        else {
            pullThenComplete()
            return
        }
        processNext(token: token, uploadURL: uploadURL, syncPlanURL: syncPlanURL, completion: pullThenComplete)
    }

    private static func processNext(
        token: String,
        uploadURL: String,
        syncPlanURL: String,
        completion: @escaping () -> Void
    ) {
        if expirationRequested {
            completion()
            return
        }

        let candidate: [String: Any]? = queue.sync {
            let now = Date().timeIntervalSince1970 * 1000
            return loadQueueUnlocked().first { operation in
                let nextAt = (operation["nextAt"] as? NSNumber)?.doubleValue ?? 0
                return nextAt <= now
            }
        }

        guard let operation = candidate, let opID = operation["opId"] as? String else {
            completion()
            return
        }

        send(operation: operation, token: token, uploadURL: uploadURL, syncPlanURL: syncPlanURL) { success in
            queue.sync {
                var operations = loadQueueUnlocked()
                guard let index = operations.firstIndex(where: { ($0["opId"] as? String) == opID }) else { return }
                if success {
                    operations.remove(at: index)
                    markCompletedUnlocked(opID)
                } else {
                    let attempt = ((operations[index]["attempt"] as? NSNumber)?.intValue ?? 0) + 1
                    operations[index]["attempt"] = attempt
                    operations[index]["nextAt"] = Date().timeIntervalSince1970 * 1000 + backoffMilliseconds(attempt)
                }
                try? saveQueueUnlocked(operations)
            }

            if success {
                processNext(token: token, uploadURL: uploadURL, syncPlanURL: syncPlanURL, completion: completion)
            } else {
                completion()
            }
        }
    }

    private static func send(
        operation: [String: Any],
        token: String,
        uploadURL: String,
        syncPlanURL: String,
        completion: @escaping (Bool) -> Void
    ) {
        guard let payload = operation["payload"] as? [String: Any] else {
            completion(true)
            return
        }

        let isDelete = (operation["type"] as? String) == "delete"
        let endpoint = isDelete ? syncPlanURL : uploadURL
        let body: [String: Any] = isDelete
            ? ["deleted_ids": payload["deleted_ids"] as? [Any] ?? [], "notes": []]
            : payload

        guard let url = URL(string: endpoint), let data = try? JSONSerialization.data(withJSONObject: body) else {
            completion(false)
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.httpBody = data
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        URLSession.shared.dataTask(with: request) { _, response, _ in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            completion((200..<300).contains(status))
        }.resume()
    }

    private static func secureToken() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "cap_sec",
            kSecAttrAccount as String: "ssToken",
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard
            SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
            let data = item as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func pull(token: String, completion: @escaping () -> Void) {
        guard
            !expirationRequested,
            let endpoint = UserDefaults.standard.string(forKey: downloadURLKey),
            let url = URL(string: endpoint)
        else {
            recordPullResult("skipped_no_download_url")
            NSLog("BackgroundNotesSync: background pull skipped because the URL is not configured")
            completion()
            return
        }

        NSLog("BackgroundNotesSync: background pull started")

        let marker = SHA256.hash(data: Data(token.utf8)).map { String(format: "%02x", $0) }.joined()
        if UserDefaults.standard.string(forKey: pullUserKey) != marker {
            UserDefaults.standard.set(marker, forKey: pullUserKey)
            UserDefaults.standard.set(0, forKey: pullWatermarkKey)
            queue.sync { try? saveInboxUnlocked([]) }
        }
        let since = UserDefaults.standard.object(forKey: pullWatermarkKey) as? NSNumber ?? 0
        let body: [String: Any] = ["since": since, "limit": 1000]
        guard let data = try? JSONSerialization.data(withJSONObject: body) else {
            completion(); return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.httpBody = data
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        URLSession.shared.dataTask(with: request) { data, response, _ in
            defer { completion() }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard
                (200..<300).contains(status),
                let data,
                let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            else {
                recordPullResult("http_or_response_error", httpStatus: status)
                NSLog("BackgroundNotesSync: background pull failed with HTTP status %d", status)
                return
            }
            let notes = object["notes"] as? [Any] ?? []
            let folders = object["folders"] as? [Any] ?? []
            if !notes.isEmpty || !folders.isEmpty {
                queue.sync {
                    var responses = loadInboxUnlocked()
                    responses.append(object)
                    if responses.count > 20 { responses.removeFirst(responses.count - 20) }
                    try? saveInboxUnlocked(responses)
                }
            }
            if let watermark = object["watermark"] as? NSNumber, watermark.doubleValue > since.doubleValue {
                UserDefaults.standard.set(watermark, forKey: pullWatermarkKey)
            }
            recordPullResult(
                "success",
                httpStatus: status,
                noteCount: notes.count,
                folderCount: folders.count
            )
            NSLog(
                "BackgroundNotesSync: background pull succeeded; notes=%d folders=%d",
                notes.count,
                folders.count
            )
        }.resume()
    }

    private static func recordPullResult(
        _ result: String,
        httpStatus: Int = 0,
        noteCount: Int = 0,
        folderCount: Int = 0
    ) {
        UserDefaults.standard.set(Date().timeIntervalSince1970 * 1000, forKey: lastPullAtKey)
        UserDefaults.standard.set(result, forKey: lastPullResultKey)
        UserDefaults.standard.set(httpStatus, forKey: lastPullHTTPStatusKey)
        UserDefaults.standard.set(noteCount, forKey: lastPullNoteCountKey)
        UserDefaults.standard.set(folderCount, forKey: lastPullFolderCountKey)
    }

    private static func queueURL() throws -> URL {
        let directory = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        return directory.appendingPathComponent(queueFilename)
    }

    private static func inboxURL() throws -> URL {
        let directory = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        return directory.appendingPathComponent(inboxFilename)
    }

    private static func loadInboxUnlocked() -> [[String: Any]] {
        guard let url = try? inboxURL(), let data = try? Data(contentsOf: url),
              let values = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] else { return [] }
        return values
    }

    private static func saveInboxUnlocked(_ responses: [[String: Any]]) throws {
        let url = try inboxURL()
        let data = try JSONSerialization.data(withJSONObject: responses)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        var resourceValues = URLResourceValues()
        resourceValues.isExcludedFromBackup = true
        var mutableURL = url
        try? mutableURL.setResourceValues(resourceValues)
    }

    private static func loadQueueUnlocked() -> [[String: Any]] {
        guard
            let url = try? queueURL(),
            let data = try? Data(contentsOf: url),
            let values = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]]
        else { return [] }
        return values
    }

    private static func saveQueueUnlocked(_ operations: [[String: Any]]) throws {
        let url = try queueURL()
        let data = try JSONSerialization.data(withJSONObject: operations)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        var resourceValues = URLResourceValues()
        resourceValues.isExcludedFromBackup = true
        var mutableURL = url
        try? mutableURL.setResourceValues(resourceValues)
    }

    private static func markCompletedUnlocked(_ opID: String) {
        var ids = UserDefaults.standard.stringArray(forKey: completedKey) ?? []
        ids.removeAll(where: { $0 == opID })
        ids.append(opID)
        if ids.count > maximumCompletedIDs {
            ids.removeFirst(ids.count - maximumCompletedIDs)
        }
        UserDefaults.standard.set(ids, forKey: completedKey)
    }

    private static func backoffMilliseconds(_ attempt: Int) -> Double {
        let exponent = max(0, min(attempt - 1, 12))
        return min(60 * 60 * 1000, 1000 * pow(2, Double(exponent)))
    }
}
