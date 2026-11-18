import UIKit
import LocalAuthentication
import Capacitor

final class StellarNotesViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(StellarSecurityPlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        overrideUserInterfaceStyle = UserDefaults.standard.bool(forKey: "notesDarkTheme") ? .dark : .light
        guard let webView = webView else { return }
        let host = UIView(frame: view.bounds)
        host.backgroundColor = .systemBackground
        webView.frame = host.bounds
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view = host
        host.addSubview(webView)
        BiometricScreenLock.shared.attach(to: host, content: webView)
    }
}

@objc(StellarSecurityPlugin)
public final class StellarSecurityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StellarSecurityPlugin"
    public let jsName = "StellarSecurity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "biometricStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBiometricLock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "appearance", returnType: CAPPluginReturnPromise)
    ]

    @objc func biometricStatus(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(BiometricScreenLock.shared.status()) }
    }

    @objc func setBiometricLock(_ call: CAPPluginCall) {
        guard let enabled = call.getBool("enabled") else { call.reject("Invalid biometric setting"); return }
        DispatchQueue.main.async {
            let lock = BiometricScreenLock.shared
            if lock.enabled == enabled { call.resolve(lock.status()); return }
            if enabled && !lock.available { call.reject("biometricNotEnrolled"); return }
            lock.change(enabled: enabled) { success in
                var result = lock.status()
                result["cancelled"] = !success
                call.resolve(result)
            }
        }
    }

    @objc func appearance(_ call: CAPPluginCall) {
        guard let theme = call.getString("theme"), ["dark", "light"].contains(theme) else {
            call.reject("Invalid appearance"); return
        }
        DispatchQueue.main.async {
            UserDefaults.standard.set(theme == "dark", forKey: "notesDarkTheme")
            self.bridge?.viewController?.overrideUserInterfaceStyle = theme == "dark" ? .dark : .light
            call.resolve()
        }
    }
}

final class BiometricScreenLock: NSObject {
    static let shared = BiometricScreenLock()
    private let preference = "notesBiometricScreenLock"
    private weak var content: UIView?
    private var cover: UIView?
    private let message = UILabel()
    private var locked = false
    private var context: LAContext?
    private var pending: ((Bool) -> Void)?
    private var request = 0

    var enabled: Bool { UserDefaults.standard.bool(forKey: preference) }
    var available: Bool { LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) }

    func status() -> [String: Any] {
        ["enabled": enabled, "available": available, "status": available ? 0 : 11, "cancelled": false]
    }

    func attach(to host: UIView, content: UIView?) {
        self.content = content
        let cover = UIView()
        cover.backgroundColor = UIColor { $0.userInterfaceStyle == .dark
            ? UIColor(red: 19/255, green: 21/255, blue: 34/255, alpha: 1)
            : UIColor(red: 246/255, green: 246/255, blue: 253/255, alpha: 1) }
        cover.translatesAutoresizingMaskIntoConstraints = false
        cover.accessibilityViewIsModal = true
        let title = UILabel()
        title.text = "Stellar Notes"
        title.font = .systemFont(ofSize: 26, weight: .bold)
        title.textAlignment = .center
        title.textColor = .label
        message.text = "Unlock to see your notes."
        message.font = .systemFont(ofSize: 16)
        message.textColor = .secondaryLabel
        message.textAlignment = .center
        message.numberOfLines = 0
        message.accessibilityTraits = .updatesFrequently
        let unlock = UIButton(type: .system)
        unlock.setTitle("Unlock Notes", for: .normal)
        unlock.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        unlock.setTitleColor(.white, for: .normal)
        unlock.backgroundColor = UIColor(red: 39/255, green: 97/255, blue: 252/255, alpha: 1)
        unlock.layer.cornerRadius = 14
        unlock.heightAnchor.constraint(equalToConstant: 52).isActive = true
        unlock.addTarget(self, action: #selector(unlockNotes), for: .touchUpInside)
        let panel = UIStackView(arrangedSubviews: [title, message, unlock])
        panel.axis = .vertical
        panel.spacing = 24
        panel.translatesAutoresizingMaskIntoConstraints = false
        cover.addSubview(panel)
        host.addSubview(cover)
        NSLayoutConstraint.activate([
            cover.leadingAnchor.constraint(equalTo: host.leadingAnchor), cover.trailingAnchor.constraint(equalTo: host.trailingAnchor),
            cover.topAnchor.constraint(equalTo: host.topAnchor), cover.bottomAnchor.constraint(equalTo: host.bottomAnchor),
            panel.centerYAnchor.constraint(equalTo: cover.safeAreaLayoutGuide.centerYAnchor),
            panel.leadingAnchor.constraint(equalTo: cover.safeAreaLayoutGuide.leadingAnchor, constant: 28),
            panel.trailingAnchor.constraint(equalTo: cover.safeAreaLayoutGuide.trailingAnchor, constant: -28)
        ])
        self.cover = cover
        locked = enabled
        if locked { conceal() } else { cover.isHidden = true }
        DispatchQueue.main.async { self.resume() }
    }

    func change(enabled: Bool, completion: @escaping (Bool) -> Void) {
        guard !locked, pending == nil else { completion(false); return }
        authenticate { success in
            if success { UserDefaults.standard.set(enabled, forKey: self.preference) }
            self.revealIfUnlocked()
            completion(success)
        }
    }

    func resignActive() { if enabled { conceal() } }

    func background() {
        if enabled { locked = true; conceal() }
        let active = context
        if pending != nil { finish(request, success: false) }
        active?.invalidate()
    }

    func resume() {
        guard UIApplication.shared.applicationState == .active else { return }
        if locked { unlockNotes() } else if pending == nil { revealIfUnlocked() }
    }

    @objc private func unlockNotes() {
        guard locked, pending == nil else { return }
        authenticate { success in
            if success { self.locked = false; self.revealIfUnlocked() }
        }
    }

    private func authenticate(_ completion: @escaping (Bool) -> Void) {
        let context = LAContext()
        context.touchIDAuthenticationAllowableReuseDuration = 0
        context.localizedCancelTitle = "Cancel"
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else {
            message.text = "Set up a device passcode in iOS Settings, then try again."
            completion(false)
            return
        }
        pending = completion
        self.context = context
        request += 1
        let revision = request
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Unlock Stellar Notes") { success, _ in
            DispatchQueue.main.async { self.finish(revision, success: success) }
        }
    }

    private func finish(_ revision: Int, success: Bool) {
        guard revision == request, let completion = pending else { return }
        pending = nil
        context = nil
        request += 1
        if !success { message.text = "Unlock cancelled. Your notes remain hidden." }
        completion(success)
    }

    private func conceal() {
        content?.endEditing(true)
        content?.isHidden = true
        content?.accessibilityElementsHidden = true
        cover?.isHidden = false
        if let cover = cover { cover.superview?.bringSubviewToFront(cover) }
    }

    private func revealIfUnlocked() {
        guard !locked, UIApplication.shared.applicationState == .active else { return }
        cover?.isHidden = true
        content?.isHidden = false
        content?.accessibilityElementsHidden = false
        message.text = "Unlock to see your notes."
    }
}
