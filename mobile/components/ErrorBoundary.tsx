import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { BorderRadius, Colors, FontSize, MinTouchTarget, Spacing } from '../constants/theme';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: string | null;
}

/**
 * Catch render-time errors so one broken screen does not take the app down.
 *
 * Without this, any exception thrown while rendering unmounts the whole tree and
 * a release build simply closes. An inspector standing in front of a damaged
 * building loses the assessment they were part-way through and has no idea why.
 * Showing the error is worth more than hiding it: the message is what gets
 * reported back, and queued assessments in the outbox survive either way.
 *
 * Note this cannot catch native crashes (an out-of-memory kill in the TFLite or
 * image-decoding layer). Those have to be prevented rather than handled.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[RADAR] Unhandled render error:', error, info.componentStack);
    this.setState({ info: info.componentStack ?? null });
  }

  private reset = () => this.setState({ error: null, info: null });

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.shell}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          The screen could not be displayed. Any assessments you have already saved are still
          queued and will sync — nothing has been lost.
        </Text>

        <ScrollView style={styles.detail} contentContainerStyle={styles.detailContent}>
          <Text style={styles.detailText}>{error.message}</Text>
          {info ? <Text style={styles.stack}>{info.trim()}</Text> : null}
        </ScrollView>

        <TouchableOpacity style={styles.button} onPress={this.reset} accessibilityRole="button">
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: Spacing.lg,
    justifyContent: 'center',
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  body: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  detail: {
    maxHeight: 220,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: BorderRadius.card,
    marginBottom: Spacing.md,
  },
  detailContent: { padding: Spacing.ms },
  detailText: {
    fontSize: FontSize.xs,
    color: Colors.unsafe,
    marginBottom: Spacing.xs,
  },
  stack: {
    fontSize: FontSize.xxs,
    color: Colors.textMuted,
    lineHeight: 15,
  },
  button: {
    minHeight: MinTouchTarget,
    borderRadius: BorderRadius.control,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: FontSize.md,
    fontWeight: '600',
  },
});
