// onnxruntime-react-native ships a legacy `unimodule.json`, so expo-modules-autolinking
// classifies it as an Expo module and skips it during React Native autolinking
// (see reactNativeConfig/androidResolver.js -- a package with an `android/` Gradle
// project and an Expo config that does not redirect it is dropped to avoid linking
// it twice). Nothing then registers it: the Expo path only picks up classes that
// implement `expo.modules.core.interfaces.Package`, and `OnnxruntimePackage` is a
// plain React Native `ReactPackage`. The Gradle project still builds into the APK,
// but `NativeModules.Onnxruntime` is null at runtime.
//
// Declaring the dependency here makes the resolver see an explicit platform config
// instead of `undefined`, which bypasses that guard and puts OnnxruntimePackage back
// into the generated PackageList.
module.exports = {
  dependencies: {
    'onnxruntime-react-native': {
      platforms: {
        android: {
          packageImportPath: 'import ai.onnxruntime.reactnative.OnnxruntimePackage;',
          packageInstance: 'new OnnxruntimePackage()',
        },
      },
    },
  },
};
