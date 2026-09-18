import Capacitor
import UIKit

/// Shares UIKit's body scale with the existing rem typography, without replacing fonts.
@objc(DynamicTypePlugin)
public final class DynamicTypePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DynamicTypePlugin"
    public let jsName = "DynamicType"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getSettings", returnType: CAPPluginReturnPromise)
    ]

    private var observers: [NSObjectProtocol] = []

    override public func load() {
        guard observers.isEmpty else { return }
        for name in [UIContentSizeCategory.didChangeNotification, UIApplication.didBecomeActiveNotification] {
            observers.append(NotificationCenter.default.addObserver(
                forName: name, object: nil, queue: .main
            ) { [weak self] notification in
                // The notification carries the new category even before view traits update.
                let category = (notification.userInfo?[UIContentSizeCategory.newValueUserInfoKey] as? String)
                    .map(UIContentSizeCategory.init(rawValue:))
                    ?? UIApplication.shared.preferredContentSizeCategory
                self?.notifyListeners("settingsChanged", data: Self.settings(for: category))
            })
        }
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    @objc public func getSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(Self.settings(for: UIApplication.shared.preferredContentSizeCategory))
        }
    }

    static func settings(for category: UIContentSizeCategory) -> JSObject {
        let traits = UITraitCollection(preferredContentSizeCategory: category)
        return [
            "rootFontSize": Double(UIFontMetrics(forTextStyle: .body).scaledValue(for: 16, compatibleWith: traits)),
            "accessibility": category.isAccessibilityCategory
        ]
    }
}
