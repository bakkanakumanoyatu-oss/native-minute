import Foundation

enum MobileAuthInstallGeneration {
    private static let markerKey = "com.nativeminutes.app.mobile-auth.install-generation"

    static func current() -> String {
        let defaults = UserDefaults.standard

        if
            let stored = defaults.string(forKey: markerKey),
            let identifier = UUID(uuidString: stored)
        {
            return identifier.uuidString.lowercased()
        }

        let generated = UUID().uuidString.lowercased()
        defaults.set(generated, forKey: markerKey)
        return generated
    }
}
