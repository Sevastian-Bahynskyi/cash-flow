// Xcode 27 refuses pod targets below iOS 15 (react-native-svg and async-storage resource bundles ship 12.4/13.4).
// Raise any lower pod deployment target in the generated Podfile's post_install.
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MIN = '15.1';
const MARKER = '# withPodsMinDeploymentTarget';

module.exports = function withPodsMinDeploymentTarget(config) {
  return withDangerousMod(config, ['ios', (cfg) => {
    const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
    let src = fs.readFileSync(podfile, 'utf8');
    if (!src.includes(MARKER)) {
      src = src.replace(/post_install do \|installer\|\n/, `post_install do |installer|
    ${MARKER}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |bc|
        if bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < ${MIN}
          bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN}'
        end
      end
    end
`);
      fs.writeFileSync(podfile, src);
    }
    return cfg;
  }]);
};
