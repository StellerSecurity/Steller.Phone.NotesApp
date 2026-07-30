import Foundation
import Capacitor
import UIKit

@objc(BackgroundNotesSyncPlugin)
public class BackgroundNotesSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BackgroundNotesSyncPlugin"
    public let jsName = "BackgroundNotesSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "replaceQueue", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeCompleted", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configurePull", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeDownloaded", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearDownloaded", returnType: CAPPluginReturnPromise),
    ]

    private var backgroundObserver: NSObjectProtocol?

    public override func load() {
        backgroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil,
            queue: .main
        ) { _ in
            BackgroundNotesSyncProcessor.runBackgroundGracePeriod()
            BackgroundNotesSyncProcessor.schedule()
        }
    }

    deinit {
        if let backgroundObserver {
            NotificationCenter.default.removeObserver(backgroundObserver)
        }
    }

    @objc func replaceQueue(_ call: CAPPluginCall) {
        guard
            let rawOperations = call.getArray("operations"),
            let uploadURL = call.getString("uploadUrl"),
            let syncPlanURL = call.getString("syncPlanUrl")
        else {
            call.reject("Missing background sync configuration")
            return
        }

        let operations: [[String: Any]] = rawOperations.compactMap { value in
            guard let object = value as? JSObject else { return nil }
            return object.reduce(into: [String: Any]()) { result, entry in
                result[entry.key] = entry.value
            }
        }

        do {
            try BackgroundNotesSyncProcessor.replaceQueue(
                operations: operations,
                uploadURL: uploadURL,
                syncPlanURL: syncPlanURL
            )
            BackgroundNotesSyncProcessor.schedule()
            call.resolve()
        } catch {
            call.reject("Unable to persist background sync queue", nil, error)
        }
    }

    @objc func consumeCompleted(_ call: CAPPluginCall) {
        call.resolve(["opIds": BackgroundNotesSyncProcessor.consumeCompleted()])
    }

    @objc func configurePull(_ call: CAPPluginCall) {
        guard let downloadURL = call.getString("downloadUrl"), !downloadURL.isEmpty else {
            call.reject("Missing download endpoint")
            return
        }
        BackgroundNotesSyncProcessor.configurePull(downloadURL: downloadURL)
        BackgroundNotesSyncProcessor.schedule()
        call.resolve()
    }

    @objc func consumeDownloaded(_ call: CAPPluginCall) {
        call.resolve(["responses": BackgroundNotesSyncProcessor.consumeDownloaded()])
    }

    @objc func clearDownloaded(_ call: CAPPluginCall) {
        BackgroundNotesSyncProcessor.clearDownloaded()
        call.resolve()
    }
}
