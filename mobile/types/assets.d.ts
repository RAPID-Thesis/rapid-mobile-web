/**
 * Metro treats `.tflite` and `.onnx` as assets (see metro.config.js, which pushes
 * them onto resolver.assetExts). Requiring one yields an asset module id that
 * `Asset.fromModule` resolves to a real file at runtime — which is the only
 * reliable way to get the bundled models onto the filesystem in a release build.
 */
declare module '*.tflite' {
  const asset: number;
  export default asset;
}

declare module '*.onnx' {
  const asset: number;
  export default asset;
}
