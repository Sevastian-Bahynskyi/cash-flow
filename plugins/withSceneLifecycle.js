// iOS 27 kills apps built with its SDK that still use the old app-delegate window (no UIScene lifecycle).
// Adopt scenes: a SceneDelegate creates the window and starts React Native in it; links arrive through the scene.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const MARKER = 'class SceneDelegate';

const SCENE_DELEGATE = `
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else { return }
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    // Expo Router reads the Expo Linking registry on cold iOS launches.
    if let url = connectionOptions.urlContexts.first?.url {
      _ = appDelegate.application(UIApplication.shared, open: url, options: [:])
    }
    if let activity = connectionOptions.userActivities.first {
      _ = appDelegate.application(UIApplication.shared, continue: activity, restorationHandler: { _ in })
    }
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: appDelegate.launchOptions)
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    RCTLinkingManager.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;

module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          { UISceneConfigurationName: 'Default Configuration', UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate' },
        ],
      },
    };
    return cfg;
  });
  return withAppDelegate(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (cfg.modResults.language !== 'swift') return cfg;
    const scene = src.indexOf(MARKER);
    if (scene >= 0) {
      const oldScene = /class SceneDelegate: UIResponder, UIWindowSceneDelegate \{[\s\S]*?\n\}/;
      cfg.modResults.contents = src.replace(oldScene, SCENE_DELEGATE.trim());
      return cfg;
    }
    const start = /#if os\(iOS\) \|\| os\(tvOS\)\s*\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*\n\s*factory\.startReactNative\([\s\S]*?\)\s*\n#endif\n/;
    if (!start.test(src)) throw new Error('withSceneLifecycle: AppDelegate window start not found; update the plugin for this Expo version');
    src = src.replace(start, '    // the window is created by SceneDelegate\n    self.launchOptions = launchOptions\n');
    src = src.replace('  var window: UIWindow?\n', '  var window: UIWindow?\n  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?\n');
    cfg.modResults.contents = src + SCENE_DELEGATE;
    return cfg;
  });
};
