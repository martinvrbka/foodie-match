import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { type Ref, useImperativeHandle } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { photoUrl, type RecipeSummary } from '../data/recipes';
import { t } from '../i18n';
import { colors, font, gradients, radius, spacing } from '../theme/tokens';
import { RecipeMeta } from './RecipeMeta';

export type SwipeDirection = 'left' | 'right';
export interface SwipeCardHandle {
  /** Animates the card off screen, then calls onSwiped (used by the buttons). */
  swipe: (dir: SwipeDirection) => void;
}

interface FaceProps {
  recipe: RecipeSummary;
  /** "{partner} won't eat this", or null. */
  badge: string | null;
}

/** The card's look, without gestures (also used for the card underneath). */
export function CardFace({ recipe, badge }: FaceProps) {
  return (
    <View style={styles.card}>
      <Image
        source={photoUrl(recipe.image_url, 'medium')}
        placeholder={photoUrl(recipe.image_url, 'small')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={150}
        accessibilityLabel={t('recipes.photo', { title: recipe.title })}
      />
      <LinearGradient colors={gradients.photo} locations={[0.45, 0.65, 1]} style={StyleSheet.absoluteFill} />
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <View style={styles.caption}>
        <Text style={styles.title} numberOfLines={3}>
          {recipe.title}
        </Text>
        <RecipeMeta recipe={recipe} style={styles.meta} />
      </View>
    </View>
  );
}

interface Props extends FaceProps {
  onSwiped: (dir: SwipeDirection) => void;
  onOpen: () => void;
  ref?: Ref<SwipeCardHandle>;
}

export function SwipeCard({ recipe, badge, onSwiped, onOpen, ref }: Props) {
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const threshold = width * 0.28;

  const flyOut = (dir: SwipeDirection) => {
    'worklet';
    x.value = withTiming((dir === 'right' ? 1 : -1) * width * 1.4, { duration: 220 }, (finished) => {
      if (finished) scheduleOnRN(onSwiped, dir);
    });
  };

  useImperativeHandle(ref, () => ({ swipe: (dir) => flyOut(dir) }));

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      x.value = e.translationX;
      y.value = e.translationY * 0.3;
    })
    .onEnd((e) => {
      if (Math.abs(x.value) > threshold || Math.abs(e.velocityX) > 900) {
        flyOut((x.value || e.velocityX) > 0 ? 'right' : 'left');
      } else {
        x.value = withSpring(0);
        y.value = withSpring(0);
      }
    });
  const tap = Gesture.Tap().onEnd((_e, success) => {
    if (success) scheduleOnRN(onOpen);
  });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotate: `${interpolate(x.value, [-width, 0, width], [-14, 0, 14])}deg` },
    ],
  }));
  const likeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, threshold], [0, 1], Extrapolation.CLAMP),
  }));
  const nopeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-threshold, 0], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <Animated.View
        style={[StyleSheet.absoluteFill, cardStyle]}
        accessible
        accessibilityRole="button"
        accessibilityLabel={recipe.title}
        accessibilityHint={t('discover.openHint')}
      >
        <CardFace recipe={recipe} badge={badge} />
        <Animated.View style={[styles.stamp, styles.likeStamp, likeStyle]}>
          <Text style={styles.likeStampText}>{t('discover.likeStamp')}</Text>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.nopeStamp, nopeStyle]}>
          <Text style={styles.nopeStampText}>{t('discover.nopeStamp')}</Text>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  caption: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, gap: spacing.xs },
  title: { fontSize: font.hero, fontWeight: '800', color: colors.onPhoto },
  meta: { color: colors.onPhoto },
  badge: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  badgeText: { fontSize: font.small, fontWeight: '700', color: colors.onAccent },
  stamp: {
    position: 'absolute',
    top: spacing.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  likeStamp: { left: spacing.lg, backgroundColor: colors.success, transform: [{ rotate: '-12deg' }] },
  nopeStamp: { right: spacing.lg, backgroundColor: colors.surface, transform: [{ rotate: '12deg' }] },
  likeStampText: { fontSize: font.hero, fontWeight: '900', color: colors.onSuccess },
  nopeStampText: { fontSize: font.hero, fontWeight: '900', color: colors.text },
});
