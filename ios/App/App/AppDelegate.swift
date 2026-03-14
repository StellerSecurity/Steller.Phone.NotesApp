import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private let privacyOverlayTag = 948271

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        showPrivacyOverlay()
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        showPrivacyOverlay()
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        hidePrivacyOverlay()
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        hidePrivacyOverlay()
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    private func activeWindow() -> UIWindow? {
        if let window = self.window {
            return window
        }

        if #available(iOS 13.0, *) {
            return UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap { $0.windows }
                .first { $0.isKeyWindow }
        }

        return UIApplication.shared.windows.first
    }

    private func showPrivacyOverlay() {
        guard let window = activeWindow() else { return }
        if window.viewWithTag(privacyOverlayTag) != nil { return }

        let overlay = UIView(frame: window.bounds)
        overlay.tag = privacyOverlayTag
        overlay.backgroundColor = UIColor(red: 246.0 / 255.0, green: 246.0 / 255.0, blue: 253.0 / 255.0, alpha: 1.0)
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]

        let title = UILabel()
        title.text = "Stellar Private Notes"
        title.textAlignment = .center
        title.textColor = UIColor(red: 11.0 / 255.0, green: 12.0 / 255.0, blue: 25.0 / 255.0, alpha: 1.0)
        title.font = UIFont.systemFont(ofSize: 22, weight: .semibold)
        title.translatesAutoresizingMaskIntoConstraints = false

        overlay.addSubview(title)
        NSLayoutConstraint.activate([
            title.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            title.centerYAnchor.constraint(equalTo: overlay.centerYAnchor)
        ])

        window.addSubview(overlay)
        window.bringSubviewToFront(overlay)
    }

    private func hidePrivacyOverlay() {
        guard let window = activeWindow() else { return }
        window.viewWithTag(privacyOverlayTag)?.removeFromSuperview()
    }
}
