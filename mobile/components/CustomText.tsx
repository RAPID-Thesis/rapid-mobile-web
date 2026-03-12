import { Platform, StyleSheet, Text as RNText, TextProps, TextStyle } from 'react-native';
import { Typography } from '../constants/theme';
import { useTypography } from '../context/TypographyContext';

type TextVariant = 'body' | 'medium' | 'bold' | 'header' | 'helper';

interface CustomTextProps extends TextProps {
  variant?: TextVariant;
}

function getFallbackFont(weight: '400' | '500' | '700') {
  if (Platform.OS === 'ios') return 'System';
  if (weight === '500') return 'sans-serif-medium';
  return 'sans-serif';
}

export default function CustomText({ style, variant = 'body', ...props }: CustomTextProps) {
  const { interLoaded } = useTypography();
  const flattened = StyleSheet.flatten(style) as TextStyle | undefined;
  const requestedWeight = flattened?.fontWeight ? String(flattened.fontWeight) : '';

  const resolvedVariant: TextVariant =
    variant !== 'body'
      ? variant
      : requestedWeight === '700' || requestedWeight === '800' || requestedWeight === '900' || requestedWeight === 'bold'
        ? 'bold'
        : requestedWeight === '500' || requestedWeight === '600' || requestedWeight === 'medium' || requestedWeight === 'semibold'
          ? 'medium'
          : 'body';

  const variantStyle: TextStyle =
    resolvedVariant === 'header'
      ? {
          fontFamily: interLoaded ? Typography.fontFamily.bold : getFallbackFont('700'),
          fontWeight: interLoaded ? undefined : '700',
        }
      : resolvedVariant === 'bold'
        ? {
            fontFamily: interLoaded ? Typography.fontFamily.bold : getFallbackFont('700'),
            fontWeight: interLoaded ? undefined : '700',
          }
        : resolvedVariant === 'medium'
          ? {
              fontFamily: interLoaded ? Typography.fontFamily.medium : getFallbackFont('500'),
              fontWeight: interLoaded ? undefined : '500',
            }
          : {
              fontFamily: interLoaded ? Typography.fontFamily.body : getFallbackFont('400'),
              fontWeight: interLoaded ? undefined : '400',
            };

  return <RNText style={[variantStyle, style]} {...props} />;
}
