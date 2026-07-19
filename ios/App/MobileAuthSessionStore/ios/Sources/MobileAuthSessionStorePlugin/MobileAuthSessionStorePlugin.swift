import Capacitor
import Foundation
import Security

private enum MobileAuthKeychainItem: String {
    case session = "session.v1"
    case pendingPkce = "pending-pkce.v1"
}

private enum MobileAuthKeychainError: Error {
    case unavailable
    case corruptValue
}

private final class MobileAuthKeychain {
    private let service: String

    init(
        namespace: String,
        installGeneration: String,
        bundleIdentifier: String = Bundle.main.bundleIdentifier ?? "com.nativeminutes.app"
    ) {
        #if DEBUG
        let buildNamespace = "debug"
        #else
        let buildNamespace = "release"
        #endif
        service = "\(bundleIdentifier).\(buildNamespace).mobile-auth.v1.\(namespace).\(installGeneration)"
    }

    func replace(_ value: String, for item: MobileAuthKeychainItem) throws {
        guard let data = value.data(using: .utf8), !data.isEmpty else {
            throw MobileAuthKeychainError.corruptValue
        }

        let query = baseQuery(for: item)
        let updates: [CFString: Any] = [
            kSecValueData: data,
            kSecAttrAccessible: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]

        let updateStatus = SecItemUpdate(query as CFDictionary, updates as CFDictionary)
        if updateStatus == errSecSuccess {
            return
        }

        guard updateStatus == errSecItemNotFound else {
            throw MobileAuthKeychainError.unavailable
        }

        var addQuery = query
        addQuery[kSecValueData] = data
        addQuery[kSecAttrAccessible] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly

        let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
        if addStatus == errSecSuccess {
            return
        }

        // A concurrent first write can win between update and add. Retrying the
        // atomic replacement preserves a single Keychain item.
        if addStatus == errSecDuplicateItem,
           SecItemUpdate(query as CFDictionary, updates as CFDictionary) == errSecSuccess {
            return
        }

        throw MobileAuthKeychainError.unavailable
    }

    func load(_ item: MobileAuthKeychainItem) throws -> String? {
        var query = baseQuery(for: item)
        query[kSecReturnData] = kCFBooleanTrue
        query[kSecMatchLimit] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound {
            return nil
        }

        guard status == errSecSuccess else {
            throw MobileAuthKeychainError.unavailable
        }

        guard let data = result as? Data,
              let value = String(data: data, encoding: .utf8),
              !value.isEmpty else {
            throw MobileAuthKeychainError.corruptValue
        }

        return value
    }

    func clear(_ item: MobileAuthKeychainItem) throws {
        let status = SecItemDelete(baseQuery(for: item) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw MobileAuthKeychainError.unavailable
        }
    }

    private func baseQuery(for item: MobileAuthKeychainItem) -> [CFString: Any] {
        [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: item.rawValue,
            kSecAttrSynchronizable: kCFBooleanFalse as Any
        ]
    }
}

@objc(MobileAuthSessionStorePlugin)
public final class MobileAuthSessionStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MobileAuthSessionStorePlugin"
    public let jsName = "MobileAuthSessionStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "savePendingPkce", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadPendingPkce", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearPendingPkce", returnType: CAPPluginReturnPromise)
    ]

    @objc public func saveSession(_ call: CAPPluginCall) {
        guard let keychain = keychain(for: call) else { return }
        save(call, item: .session, keychain: keychain)
    }

    @objc public func loadSession(_ call: CAPPluginCall) {
        guard let keychain = keychain(for: call) else { return }
        load(call, item: .session, keychain: keychain)
    }

    @objc public func clearSession(_ call: CAPPluginCall) {
        guard let keychain = keychain(for: call) else { return }
        clear(call, item: .session, keychain: keychain)
    }

    @objc public func savePendingPkce(_ call: CAPPluginCall) {
        guard let keychain = keychain(for: call) else { return }
        save(call, item: .pendingPkce, keychain: keychain)
    }

    @objc public func loadPendingPkce(_ call: CAPPluginCall) {
        guard let keychain = keychain(for: call) else { return }
        load(call, item: .pendingPkce, keychain: keychain)
    }

    @objc public func clearPendingPkce(_ call: CAPPluginCall) {
        guard let keychain = keychain(for: call) else { return }
        clear(call, item: .pendingPkce, keychain: keychain)
    }

    private func keychain(for call: CAPPluginCall) -> MobileAuthKeychain? {
        let namespace = call.getString("namespace", "")

        guard
            !namespace.isEmpty,
            namespace.range(
                of: "^[A-Za-z0-9._-]{1,96}$",
                options: String.CompareOptions.regularExpression
            ) != nil
        else {
            call.unavailable("invalid_secure_storage_input")
            return nil
        }

        return MobileAuthKeychain(
            namespace: namespace,
            installGeneration: MobileAuthInstallGeneration.current()
        )
    }

    private func save(
        _ call: CAPPluginCall,
        item: MobileAuthKeychainItem,
        keychain: MobileAuthKeychain
    ) {
        let value = call.getString("value", "")
        guard !value.isEmpty else {
            call.unavailable("invalid_secure_storage_input")
            return
        }

        do {
            try keychain.replace(value, for: item)
            call.resolve()
        } catch {
            call.unavailable("secure_storage_unavailable")
        }
    }

    private func load(
        _ call: CAPPluginCall,
        item: MobileAuthKeychainItem,
        keychain: MobileAuthKeychain
    ) {
        do {
            if let value = try keychain.load(item) {
                call.resolve(["value": value])
            } else {
                call.resolve(["value": NSNull()])
            }
        } catch MobileAuthKeychainError.corruptValue {
            try? keychain.clear(item)
            call.unavailable("secure_storage_unavailable")
        } catch {
            call.unavailable("secure_storage_unavailable")
        }
    }

    private func clear(
        _ call: CAPPluginCall,
        item: MobileAuthKeychainItem,
        keychain: MobileAuthKeychain
    ) {
        do {
            try keychain.clear(item)
            call.resolve()
        } catch {
            call.unavailable("secure_storage_unavailable")
        }
    }
}
