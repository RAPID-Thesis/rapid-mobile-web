import * as ImageManipulator from 'expo-image-manipulator';
import jpeg from 'jpeg-js';

import { IMG_SIZE } from './constants';

/**
 * Center-crop square, resize 224x224, return RGB uint8 [224x224x3].
 *
 * The first manipulateAsync call takes no actions on purpose: it returns the
 * decoder's own view of the image, so the crop rectangle below is guaranteed to
 * be in bounds. Reading dimensions from Image.getSize instead is cheaper but not
 * equivalent -- on an EXIF-rotated photo it reports the display size, which is
 * the transpose of the stored pixels, and an out-of-bounds crop is a native
 * fault rather than a catchable error.
 */
export async function preprocessPhotoForModel(uri: string): Promise<Uint8Array> {
  const square = await ImageManipulator.manipulateAsync(uri, [], {
    compress: 1,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const side = Math.min(square.width, square.height);
  const cropX = Math.floor((square.width - side) / 2);
  const cropY = Math.floor((square.height - side) / 2);

  const cropped = await ImageManipulator.manipulateAsync(
    square.uri,
    [
      { crop: { originX: cropX, originY: cropY, width: side, height: side } },
      { resize: { width: IMG_SIZE, height: IMG_SIZE } },
    ],
    { compress: 1, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );

  if (!cropped.base64) throw new Error('Photo preprocess failed');

  const binary = decodeBase64(cropped.base64);
  const decoded = jpeg.decode(binary, { useTArray: true });
  const { width, height, data } = decoded;
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
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
