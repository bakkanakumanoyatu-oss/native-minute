import Capacitor
import Foundation
import UIKit

@objc(MobileAuthLifecyclePlugin)
public final class MobileAuthLifecyclePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MobileAuthLifecyclePlugin"
    public let jsName = "MobileAuthLifecycle"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getLaunchUrl", returnType: CAPPluginReturnPromise)
    ]

    private var observers: [NSObjectProtocol] = []

    override public func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleUrlOpened(notification:)),
            name: Notification.Name.capacitorOpenURL,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleUrlOpened(notification:)),
            name: Notification.Name.capacitorOpenUniversalLink,
            object: nil
        )
        observers.append(
            NotificationCenter.default.addObserver(
                forName: UIApplication.didBecomeActiveNotification,
                object: nil,
                queue: OperationQueue.main
            ) { [weak self] _ in
                self?.notifyListeners("appStateChange", data: ["isActive": true])
            }
        )
        observers.append(
            NotificationCenter.default.addObserver(
                forName: UIApplication.willResignActiveNotification,
                object: nil,
                queue: OperationQueue.main
            ) { [weak self] _ in
                self?.notifyListeners("appStateChange", data: ["isActive": false])
            }
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        observers.forEach { observer in
            NotificationCenter.default.removeObserver(observer)
        }
    }

    @objc public func getLaunchUrl(_ call: CAPPluginCall) {
        guard let url = ApplicationDelegateProxy.shared.lastURL?.absoluteString else {
            call.resolve()
            return
        }

        call.resolve(["url": url])
    }

    @objc private func handleUrlOpened(notification: NSNotification) {
        guard
            let object = notification.object as? [String: Any?],
            let url = object["url"] as? NSURL,
            let absoluteUrl = url.absoluteString
        else {
            return
        }

        notifyListeners(
            "appUrlOpen",
            data: ["url": absoluteUrl],
            retainUntilConsumed: true
        )
    }
}
