import { platformShadow } from '../utils/platformShadow';

export const WizardTheme = {
  colors: {
    primary: '#0A4D92',
    primaryPressed: '#083F78',
    background: '#F4F6F8',
    card: '#FFFFFF',
    text: '#102A43',
    textMuted: '#666666',
    border: '#D9E2EC',
    pending: '#9AA5B1',
    success: '#2E7D32',
    restricted: '#ED6C02',
    unsafe: '#D32F2F',
    infoBg: '#E8F1FC',
    infoBorder: '#B7D4F4',
    infoText: '#0F355E',
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 14,
    pill: 999,
  },
  spacing: {
    sm: 8,
    md: 16,
    lg: 24,
  },
  typography: {
    fontFamily: {
      body: 'Inter_400Regular',
      medium: 'Inter_500Medium',
      bold: 'Inter_700Bold',
    },
    label: 16,
    body: 15,
    helper: 13,
  },
  elevation: {
    ...platformShadow('#0F172A', { width: 0, height: 2 }, 0.07, 6, 2),
  },
} as const;
