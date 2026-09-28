// The bottom panel: Swipe · Matches · Recipes · Week plan (grooming package ux-simplification).
// Tab screens stay mounted, so each keeps its state (deck position, plan) when you come back.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { type ComponentProps, useEffect } from 'react';
import type { ColorValue } from 'react-native';
import { useAuth } from '../../data/auth';
import { useMatchesLastSeen, useMatchList } from '../../data/matches';
import { useProfile } from '../../data/profile';
import { useTonight } from '../../data/tonight';
import { useWeek } from '../../data/week';
import { t } from '../../i18n';
import { countNewMatches } from '../../logic/matches';
import { ACTIVE_STATUSES } from '../../logic/tonight';
import { isGenerated } from '../../logic/week';
import { colors, font } from '../../theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

const icon =
  (name: IconName) =>
  ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Ionicons name={focused ? name : (`${name}-outline` as IconName)} size={size} color={color as string} />
  );

export default function TabsLayout() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const { me, partner } = useProfile();

  // First run: ask what they don't eat before anything else.
  useEffect(() => {
    if (me && !me.onboarded) router.replace({ pathname: '/exclusions', params: { onboarding: '1' } });
  }, [me]);

  // Badges replace Home's banners: new matches or a Tonight round to join, a week plan to join.
  const { matches } = useMatchList();
  const lastSeen = useMatchesLastSeen(userId);
  const newMatches = countNewMatches(
    (matches ?? []).map((m) => ({ recipeId: m.recipe.id, createdAt: m.createdAt, cookTimeMin: null, cuisine: null })),
    lastSeen,
  );
  const tonight = useTonight(userId);
  const s = tonight.data?.session;
  const tonightInvite =
    !!partner &&
    !!s &&
    ACTIVE_STATUSES.includes(s.status) &&
    s.startedBy !== userId &&
    s.status === 'swiping' &&
    !tonight.data?.me?.swipeDone;
  const week = useWeek();
  const planInvite =
    !!partner &&
    !!week.data?.plans.some(
      (p) =>
        !isGenerated(p.status) &&
        p.startedBy !== userId &&
        !week.data?.members.get(p.id)?.find((m) => m.userId === userId)?.reswipeDone,
    );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryStrong,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: font.small - 2, fontWeight: '700' },
        tabBarBadgeStyle: { backgroundColor: colors.accent, color: colors.onAccent, fontWeight: '700' },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.swipe'), tabBarIcon: icon('flame') }} />
      <Tabs.Screen
        name="matches"
        options={{
          title: t('tabs.matches'),
          tabBarIcon: icon('heart'),
          tabBarBadge: tonightInvite ? '!' : newMatches > 0 ? newMatches : undefined,
        }}
      />
      <Tabs.Screen name="recipes" options={{ title: t('tabs.recipes'), tabBarIcon: icon('book') }} />
      <Tabs.Screen
        name="week"
        options={{ title: t('tabs.week'), tabBarIcon: icon('calendar'), tabBarBadge: planInvite ? '!' : undefined }}
      />
    </Tabs>
  );
}
