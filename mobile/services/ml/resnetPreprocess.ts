import { IMG_SIZE } from './constants';

const RESNET_MEANS = [103.939, 116.779, 123.68];

/**
 * RGB uint8 224×224×3 → float32 ResNet50-preprocessed tensor.
 *
 * Mirrors `tf.keras.applications.resnet50.preprocess_input` in its default
 * "caffe" mode, which does two things in this order:
 *
 *   1. flip the channel axis, RGB → BGR
 *   2. subtract the per-channel means [103.939, 116.779, 123.68]
 *
 * so the tensor the network expects is (B-103.939, G-116.779, R-123.68).
 *
 * This has to be done here rather than in the graph: train_resnet50.py applies
 * preprocess_input *inside* the trained model, but export_mobile_models.py
 * rebuilds the inference graph from a bare keras.Input and drops that layer, so
 * the .tflite starts at the first conv and takes already-preprocessed input.
 *
 * The flip was previously missing — the means were subtracted straight down the
 * RGB axis, which fed the network (R-103.939, G-116.779, B-123.68). Red and blue
 * were swapped on every on-device image prediction. parity_test_mobile_models.py
 * could not see it: it calls Keras' own preprocess_input and never exercises this
 * function, and its probe image was near-grey, where a channel swap is close to a
 * no-op. Both gaps are now covered by _check_ts_preprocess_parity there.
 */
export function applyResNetPreprocess(rgb: Uint8Array): Float32Array {
  const n = IMG_SIZE * IMG_SIZE * 3;
  const out = new Float32Array(n);
  for (let i = 0; i < IMG_SIZE * IMG_SIZE; i++) {
    out[i * 3] = rgb[i * 3 + 2]! - RESNET_MEANS[0]!; // B
    out[i * 3 + 1] = rgb[i * 3 + 1]! - RESNET_MEANS[1]!; // G
    out[i * 3 + 2] = rgb[i * 3]! - RESNET_MEANS[2]!; // R
  }
  return out;
}

export { RESNET_MEANS };
