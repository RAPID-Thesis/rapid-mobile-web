import { Platform, type ViewStyle } from 'react-native';

function hexToRgb(color: string): { r: number; g: number; b: number } {
  let hex = color.replace('#', '');
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (hex.length !== 6) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

/** Web wants `boxShadow`; native keeps shadow* + optional elevation (Android). */
export function platformShadow(
  color: string,
  offset: { width: number; height: number },
  opacity: number,
  radius: number,
  elevation?: number
): ViewStyle {
  if (Platform.OS === 'web') {
    const { r, g, b } = hexToRgb(color);
    return {
      boxShadow: `${offset.width}px ${offset.height}px ${radius}px rgba(${r},${g},${b},${opacity})`,
    };
  }
  const out: ViewStyle = {
    shadowColor: color,
    shadowOffset: offset,
    shadowOpacity: opacity,
    shadowRadius: radius,
  };
  if (elevation != null) out.elevation = elevation;
  return out;
}
