import { Image } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import jpeg from 'jpeg-js';

import { IMG_SIZE } from './constants';

/**
 * Read pixel dimensions without decoding the image into a bitmap.
 *
 * The previous implementation called manipulateAsync with no operations purely
 * to learn width and height. That fully decodes the photo and re-encodes it at
 * quality 1.0 — for a 12 MP capture that is a ~48 MB bitmap plus a large
 * temporary JPEG, per photo, before any useful work happens. With eight photos
 * on a mid-range phone that was enough to get the process killed by the OS,
 * which no JavaScript try/catch can intercept.
 */
function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
    );
  });
}

/**
 * Centre-crop to a square, resize to 224x224, return RGB uint8 [224*224*3].
 *
 * Matches the server pipeline in ml_fusion_engine.predict_image: same crop, same
 * size, same channel order. Changing any of it here means changing it there too.
 */
export async function preprocessPhotoForModel(uri: string): Promise<Uint8Array> {
  const { width, height } = await getImageSize(uri);
  const side = Math.max(1, Math.min(width, height));

  // Clamp so the rectangle can never exceed the bitmap. Image.getSize reports
  // display dimensions, which on an EXIF-rotated photo are the transpose of the
  // stored pixels; handing the decoder an out-of-bounds crop is a native fault,
  // not a catchable JavaScript error.
  const cropX = Math.max(0, Math.min(Math.floor((width - side) / 2), Math.max(0, width - side)));
  const cropY = Math.max(0, Math.min(Math.floor((height - side) / 2), Math.max(0, height - side)));

  // One pass: crop and resize together, so the full-resolution bitmap is only
  // ever materialized once and is released as soon as this call returns.
  let cropped;
  try {
    cropped = await ImageManipulator.manipulateAsync(
      uri,
      [
        { crop: { originX: cropX, originY: cropY, width: side, height: side } },
        { resize: { width: IMG_SIZE, height: IMG_SIZE } },
      ],
      { compress: 1, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
  } catch {
    // Crop rejected (orientation mismatch, unusual colour space). A plain
    // square resize distorts aspect ratio slightly but still yields a usable
    // 224x224 tensor, which beats dropping the photo from the image branch.
    cropped = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: IMG_SIZE, height: IMG_SIZE } }],
      { compress: 1, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
  }

  if (!cropped.base64) throw new Error('Photo preprocess produced no image data');

  const binary = decodeBase64(cropped.base64);
  const decoded = jpeg.decode(binary, { useTArray: true });
  const { width: dw, height: dh, data } = decoded;

  const rgb = new Uint8Array(dw * dh * 3);
  for (let i = 0; i < dw * dh; i++) {
    rgb[i * 3] = data[i * 4]!;
    rgb[i * 3 + 1] = data[i * 4 + 1]!;
    rgb[i * 3 + 2] = data[i * 4 + 2]!;
  }
  return rgb;
}

function decodeBase64(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const len = binaryString.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = binaryString.charCodeAt(i);
  return out;
}
