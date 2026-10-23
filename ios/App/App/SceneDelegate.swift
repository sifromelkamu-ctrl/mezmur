import UIKit

// Minimal Scene lifecycle adoption — see the UIApplicationSceneManifest
// comment in Info.plist for why this exists. UISceneStoryboardFile in that
// manifest points at the same "Main" storyboard AppDelegate always used, so
// UIKit instantiates the window and initial view controller (Capacitor's
// CAPBridgeViewController) from it automatically; nothing here needs to
// construct the window by hand for that to keep working exactly as before.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
}
