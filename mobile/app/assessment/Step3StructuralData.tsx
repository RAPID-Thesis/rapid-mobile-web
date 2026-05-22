import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, MinTouchTarget } from '../../constants/theme';
import { WizardTheme } from '../../constants/wizardTheme';
import Text from '../../components/CustomText';

export type PrimaryMaterialOption =
  | 'Concrete Hollow Block (CHB)'
  | 'Reinforced Concrete (RC)'
  | 'Light Wood Frame'
  | 'Steel Frame'
  | 'Mixed Use';

export type StructuralSystemOption =
  | 'Moment Resisting Frame'
  | 'Shear Wall System'
  | 'Unreinforced Masonry'
  | 'Braced Frame';

export type SoilClassOption =
  | 'Type A/B - Hard Rock'
  | 'Type C - Dense Soil'
  | 'Type D - Stiff Soil'
  | 'Type E/F - Soft/Vulnerable';

export type TopographyOption = 'Flat' | 'Gentle Slope' | 'Steep Hill';

export interface StructuralDataState {
  stories: string;
  yearBuilt: string;
  structuralSystem: StructuralSystemOption | '';
  primaryMaterial: PrimaryMaterialOption | '';
  condition: string;
  soilClass: SoilClassOption | '';
  topography: TopographyOption | '';
  verticalIrregularity: boolean;
  planIrregularity: boolean;
  poundingHazard: boolean;
  fallingHazard: boolean;
}

interface Step3StructuralDataProps {
  value: StructuralDataState;
  onChange: (next: StructuralDataState) => void;
  onBack: () => void;
  onNext: () => void;
  canProceed?: boolean;
}

type PickerFieldType = 'stories' | 'yearBuilt' | 'material' | 'system' | 'soil' | 'topography';

const STORIES_OPTIONS = ['1', '2', '3'] as const;

const CURRENT_YEAR = new Date().getFullYear();

function buildYearBuiltOptions(): { label: string; value: string }[] {
  const options: { label: string; value: string }[] = [{ label: 'Before 1970', value: '1965' }];
  for (let year = 1970; year <= CURRENT_YEAR; year += 1) {
    const value = String(year);
    options.push({ label: value, value });
  }
  return options;
}

const YEAR_BUILT_OPTIONS = buildYearBuiltOptions();

const PRIMARY_MATERIAL_OPTIONS: PrimaryMaterialOption[] = [
  'Concrete Hollow Block (CHB)',
  'Reinforced Concrete (RC)',
  'Light Wood Frame',
  'Steel Frame',
  'Mixed Use',
];

const STRUCTURAL_SYSTEM_OPTIONS: StructuralSystemOption[] = [
  'Moment Resisting Frame',
  'Shear Wall System',
  'Unreinforced Masonry',
  'Braced Frame',
];

const SOIL_CLASS_OPTIONS: SoilClassOption[] = [
  'Type A/B - Hard Rock',
  'Type C - Dense Soil',
  'Type D - Stiff Soil',
  'Type E/F - Soft/Vulnerable',
];

const TOPOGRAPHY_OPTIONS: TopographyOption[] = ['Flat', 'Gentle Slope', 'Steep Hill'];
const CONTROL_HEIGHT = Math.max(MinTouchTarget, 48);

function yearBuiltLabel(value: string): string {
  if (!value) return '';
  const match = YEAR_BUILT_OPTIONS.find((o) => o.value === value);
  return match?.label ?? value;
}

function SelectField({
  label,
  placeholder,
  value,
  onPress,
}: {
  label: string;
  placeholder: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity style={styles.selectField} onPress={onPress} activeOpacity={0.85}>
        <Text style={[styles.selectText, !value && styles.selectPlaceholder]}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={WizardTheme.colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

export default function Step3StructuralData({
  value,
  onChange,
  onBack,
  onNext,
  canProceed,
}: Step3StructuralDataProps) {
  const [activePicker, setActivePicker] = useState<PickerFieldType | null>(null);

  const pickerConfig = useMemo(() => {
    switch (activePicker) {
      case 'stories':
        return {
          title: 'Number of Stories',
          options: [...STORIES_OPTIONS],
          selected: value.stories,
          onSelect: (selected: string) => onChange({ ...value, stories: selected }),
        };
      case 'yearBuilt':
        return {
          title: 'Year Built',
          options: YEAR_BUILT_OPTIONS.map((o) => o.label),
          selected: yearBuiltLabel(value.yearBuilt),
          onSelect: (selected: string) => {
            const match = YEAR_BUILT_OPTIONS.find((o) => o.label === selected);
            onChange({ ...value, yearBuilt: match?.value ?? selected });
          },
        };
      case 'material':
        return {
          title: 'Primary Material',
          options: PRIMARY_MATERIAL_OPTIONS,
          selected: value.primaryMaterial,
          onSelect: (selected: string) =>
            onChange({ ...value, primaryMaterial: selected as PrimaryMaterialOption }),
        };
      case 'system':
        return {
          title: 'Structural System',
          options: STRUCTURAL_SYSTEM_OPTIONS,
          selected: value.structuralSystem,
          onSelect: (selected: string) =>
            onChange({ ...value, structuralSystem: selected as StructuralSystemOption }),
        };
      case 'soil':
        return {
          title: 'Soil Class',
          options: SOIL_CLASS_OPTIONS,
          selected: value.soilClass,
          onSelect: (selected: string) => onChange({ ...value, soilClass: selected as SoilClassOption }),
        };
      case 'topography':
        return {
          title: 'Topography',
          options: TOPOGRAPHY_OPTIONS,
          selected: value.topography,
          onSelect: (selected: string) => onChange({ ...value, topography: selected as TopographyOption }),
        };
      default:
        return null;
    }
  }, [activePicker, onChange, value]);

  const allowNext =
    canProceed ??
    Boolean(value.primaryMaterial && value.structuralSystem && value.soilClass && value.topography);

  const toggleModifier = (field: keyof Pick<
    StructuralDataState,
    'verticalIrregularity' | 'planIrregularity' | 'poundingHazard' | 'fallingHazard'
  >) => {
    onChange({ ...value, [field]: !value[field] });
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.scrollInner}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Building Structure</Text>
          <Text style={styles.cardHint}>
            Use standardized values only to improve downstream risk scoring and ML quality.
          </Text>

          <SelectField
            label="Number of Stories"
            placeholder="Select number of stories"
            value={value.stories}
            onPress={() => setActivePicker('stories')}
          />

          <SelectField
            label="Year Built"
            placeholder="Select year built"
            value={yearBuiltLabel(value.yearBuilt)}
            onPress={() => setActivePicker('yearBuilt')}
          />

          <SelectField
            label="Primary Material *"
            placeholder="Select primary material"
            value={value.primaryMaterial}
            onPress={() => setActivePicker('material')}
          />

          <SelectField
            label="Structural System *"
            placeholder="Select structural system"
            value={value.structuralSystem}
            onPress={() => setActivePicker('system')}
          />

          <Text style={styles.fieldLabel}>Condition Notes</Text>
          <TextInput
            style={styles.inputNotes}
            value={value.condition}
            onChangeText={(condition) => onChange({ ...value, condition })}
            placeholder="Describe visible condition..."
            placeholderTextColor={Colors.textMuted}
            multiline
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Site & Topography</Text>

          <SelectField
            label="Soil Class *"
            placeholder="Select soil class"
            value={value.soilClass}
            onPress={() => setActivePicker('soil')}
          />

          <SelectField
            label="Topography *"
            placeholder="Select topography"
            value={value.topography}
            onPress={() => setActivePicker('topography')}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Vulnerability Modifiers</Text>
          <Text style={styles.cardHint}>
            Mark observed irregularities that can increase seismic vulnerability.
          </Text>

          <View style={styles.switchRow}>
            <View style={styles.switchTextCol}>
              <Text style={styles.switchLabel}>
                Soft story (e.g., open ground floor) or split levels?
              </Text>
              <Text style={styles.switchHelper}>
                Vertical irregularity means one floor is much weaker than floors above.
              </Text>
            </View>
            <Switch
              value={value.verticalIrregularity}
              onValueChange={() => toggleModifier('verticalIrregularity')}
              trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
              thumbColor={value.verticalIrregularity ? WizardTheme.colors.primary : '#FFFFFF'}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchTextCol}>
              <Text style={styles.switchLabel}>
                L-shaped, T-shaped, or irregularly shaped?
              </Text>
              <Text style={styles.switchHelper}>
                Plan irregularity means the building shape twists unevenly during shaking.
              </Text>
            </View>
            <Switch
              value={value.planIrregularity}
              onValueChange={() => toggleModifier('planIrregularity')}
              trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
              thumbColor={value.planIrregularity ? WizardTheme.colors.primary : '#FFFFFF'}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchTextCol}>
              <Text style={styles.switchLabel}>
                Adjacent to another structure of a different height?
              </Text>
              <Text style={styles.switchHelper}>
                Pounding hazard happens when neighboring buildings collide in an earthquake.
              </Text>
            </View>
            <Switch
              value={value.poundingHazard}
              onValueChange={() => toggleModifier('poundingHazard')}
              trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
              thumbColor={value.poundingHazard ? WizardTheme.colors.primary : '#FFFFFF'}
            />
          </View>

          <View style={[styles.switchRow, styles.switchRowLast]}>
            <View style={styles.switchTextCol}>
              <Text style={styles.switchLabel}>
                Heavy parapets, overhangs, or unbraced chimneys?
              </Text>
              <Text style={styles.switchHelper}>
                Falling hazards are exterior elements that can detach and injure occupants.
              </Text>
            </View>
            <Switch
              value={value.fallingHazard}
              onValueChange={() => toggleModifier('fallingHazard')}
              trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
              thumbColor={value.fallingHazard ? WizardTheme.colors.primary : '#FFFFFF'}
            />
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.85}>
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.nextBtn, !allowNext && styles.nextBtnDisabled]}
          onPress={onNext}
          disabled={!allowNext}
          activeOpacity={0.85}
        >
          <Text style={styles.nextBtnText}>Next</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={Boolean(pickerConfig)} transparent animationType="fade" onRequestClose={() => setActivePicker(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setActivePicker(null)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{pickerConfig?.title}</Text>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
              {pickerConfig?.options.map((option, index) => {
                const isSelected = option === pickerConfig.selected;
                const isLast = index === pickerConfig.options.length - 1;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.optionRow,
                      isSelected && styles.optionRowSelected,
                      isLast && styles.optionRowLast,
                    ]}
                    onPress={() => {
                      pickerConfig.onSelect(option);
                      setActivePicker(null);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{option}</Text>
                    {isSelected ? (
                      <Ionicons name="checkmark-circle" size={18} color={WizardTheme.colors.primary} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  scrollInner: { gap: WizardTheme.spacing.lg, paddingBottom: WizardTheme.spacing.md },
  card: {
    backgroundColor: WizardTheme.colors.card,
    borderRadius: WizardTheme.radius.md,
    padding: WizardTheme.spacing.md,
    borderWidth: 1,
    borderColor: WizardTheme.colors.border,
    ...WizardTheme.elevation,
  },
  cardTitle: { fontSize: 20, fontWeight: '800', color: WizardTheme.colors.text, marginBottom: 4 },
  cardHint: {
    fontSize: WizardTheme.typography.helper,
    color: WizardTheme.colors.textMuted,
    marginBottom: WizardTheme.spacing.sm,
    lineHeight: 18,
  },
  fieldLabel: {
    fontSize: WizardTheme.typography.label,
    fontWeight: '700',
    color: WizardTheme.colors.text,
    marginTop: WizardTheme.spacing.md,
    marginBottom: WizardTheme.spacing.sm,
  },
  input: {
    minHeight: CONTROL_HEIGHT,
    borderWidth: 1,
    borderColor: WizardTheme.colors.border,
    borderRadius: WizardTheme.radius.md,
    paddingHorizontal: WizardTheme.spacing.md,
    fontSize: WizardTheme.typography.body,
    color: WizardTheme.colors.text,
    backgroundColor: WizardTheme.colors.card,
  },
  inputNotes: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: WizardTheme.colors.border,
    borderRadius: WizardTheme.radius.md,
    paddingHorizontal: WizardTheme.spacing.md,
    paddingVertical: WizardTheme.spacing.sm,
    fontSize: WizardTheme.typography.body,
    color: WizardTheme.colors.text,
    backgroundColor: WizardTheme.colors.card,
    textAlignVertical: 'top',
  },
  selectField: {
    minHeight: CONTROL_HEIGHT,
    borderWidth: 1,
    borderColor: WizardTheme.colors.border,
    borderRadius: WizardTheme.radius.md,
    paddingHorizontal: WizardTheme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: WizardTheme.colors.card,
  },
  selectText: {
    fontSize: WizardTheme.typography.body,
    color: WizardTheme.colors.text,
    flex: 1,
    paddingRight: WizardTheme.spacing.sm,
  },
  selectPlaceholder: { color: WizardTheme.colors.textMuted },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: WizardTheme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: WizardTheme.colors.border,
    paddingVertical: WizardTheme.spacing.md,
  },
  switchRowLast: { borderBottomWidth: 0 },
  switchTextCol: { flex: 1 },
  switchLabel: { fontSize: WizardTheme.typography.label, color: WizardTheme.colors.text, fontWeight: '700' },
  switchHelper: {
    fontSize: WizardTheme.typography.helper,
    color: WizardTheme.colors.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    gap: WizardTheme.spacing.md,
    paddingTop: WizardTheme.spacing.md,
  },
  backBtn: {
    flex: 1,
    minHeight: CONTROL_HEIGHT,
    borderWidth: 1,
    borderColor: WizardTheme.colors.border,
    borderRadius: WizardTheme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: WizardTheme.colors.card,
  },
  backBtnText: { fontSize: WizardTheme.typography.body, fontWeight: '700', color: WizardTheme.colors.text },
  nextBtn: {
    flex: 2,
    minHeight: CONTROL_HEIGHT,
    borderRadius: WizardTheme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: WizardTheme.colors.primary,
  },
  nextBtnDisabled: { backgroundColor: WizardTheme.colors.pending },
  nextBtnText: { color: '#FFFFFF', fontSize: WizardTheme.typography.body, fontWeight: '800' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    padding: WizardTheme.spacing.md,
  },
  modalCard: {
    backgroundColor: WizardTheme.colors.card,
    borderRadius: WizardTheme.radius.md,
    paddingTop: WizardTheme.spacing.md,
    paddingHorizontal: WizardTheme.spacing.md,
    paddingBottom: WizardTheme.spacing.md,
    maxHeight: '70%',
    width: '100%',
    overflow: 'hidden',
  },
  modalTitle: {
    fontSize: WizardTheme.typography.label,
    fontWeight: '800',
    color: WizardTheme.colors.text,
    marginBottom: WizardTheme.spacing.sm,
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalScrollContent: {
    paddingBottom: WizardTheme.spacing.sm,
  },
  optionRow: {
    minHeight: CONTROL_HEIGHT,
    borderWidth: 1,
    borderColor: WizardTheme.colors.border,
    borderRadius: WizardTheme.radius.md,
    paddingHorizontal: WizardTheme.spacing.md,
    marginBottom: WizardTheme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: WizardTheme.colors.card,
  },
  optionRowLast: { marginBottom: 0 },
  optionRowSelected: { borderColor: '#93C5FD', backgroundColor: '#EFF6FF' },
  optionText: {
    flex: 1,
    fontSize: WizardTheme.typography.body,
    color: WizardTheme.colors.text,
    paddingRight: WizardTheme.spacing.sm,
  },
  optionTextSelected: { color: WizardTheme.colors.primary, fontWeight: '700' },
});
