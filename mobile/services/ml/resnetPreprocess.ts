import { IMG_SIZE } from './constants';

const RESNET_MEANS = [103.939, 116.779, 123.68];

/** RGB uint8 224×224×3 → float32 ResNet50-preprocessed tensor (caffe mean subtract). */
export function applyResNetPreprocess(rgb: Uint8Array): Float32Array {
  const n = IMG_SIZE * IMG_SIZE * 3;
  const out = new Float32Array(n);
  for (let i = 0; i < IMG_SIZE * IMG_SIZE; i++) {
    out[i * 3] = rgb[i * 3]! - RESNET_MEANS[0]!;
    out[i * 3 + 1] = rgb[i * 3 + 1]! - RESNET_MEANS[1]!;
    out[i * 3 + 2] = rgb[i * 3 + 2]! - RESNET_MEANS[2]!;
  }
  return out;
}

export { RESNET_MEANS };
