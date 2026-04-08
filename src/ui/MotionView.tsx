import { useEffect } from 'react';
import type { PropsWithChildren, ReactElement } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useMotionScope } from './MotionScope';

type Direction = 'left' | 'right' | 'up' | 'down';

type Props = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  index?: number;
  delayMs?: number;
  stepMs?: number;
  distance?: number;
  direction?: Direction;
  rotateFrom?: number;
  scaleFrom?: number;
}>;

const initialOffset = (direction: Direction, distance: number): { x: number; y: number } => {
  if (direction === 'left') return { x: -distance, y: 18 };
  if (direction === 'right') return { x: distance, y: 18 };
  if (direction === 'down') return { x: 0, y: distance };
  return { x: 0, y: -distance };
};

export function MotionView({
  children,
  style,
  index = 0,
  delayMs = 0,
  stepMs = 70,
  distance = 120,
  direction = 'up',
  rotateFrom = direction === 'left' ? -6 : direction === 'right' ? 6 : 2,
  scaleFrom = 0.92,
}: Props): ReactElement {
  const motionRun = useMotionScope();
  const offset = initialOffset(direction, distance);
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(offset.x);
  const translateY = useSharedValue(offset.y);
  const scale = useSharedValue(scaleFrom);
  const rotate = useSharedValue(rotateFrom);

  useEffect(() => {
    cancelAnimation(opacity);
    cancelAnimation(translateX);
    cancelAnimation(translateY);
    cancelAnimation(scale);
    cancelAnimation(rotate);

    opacity.value = 0;
    translateX.value = offset.x;
    translateY.value = offset.y;
    scale.value = scaleFrom;
    rotate.value = rotateFrom;

    const delay = delayMs + index * stepMs;
    opacity.value = withDelay(
      delay,
      withTiming(1, {
        duration: 320,
        easing: Easing.out(Easing.cubic),
      }),
    );
    translateX.value = withDelay(
      delay,
      withSpring(0, {
        damping: 14,
        stiffness: 130,
        mass: 0.85,
      }),
    );
    translateY.value = withDelay(
      delay,
      withSpring(0, {
        damping: 15,
        stiffness: 135,
        mass: 0.88,
      }),
    );
    scale.value = withDelay(
      delay,
      withSpring(1, {
        damping: 15,
        stiffness: 140,
        mass: 0.85,
      }),
    );
    rotate.value = withDelay(
      delay,
      withTiming(0, {
        duration: 430,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [
    delayMs,
    index,
    motionRun,
    offset.x,
    offset.y,
    opacity,
    rotate,
    rotateFrom,
    scale,
    scaleFrom,
    stepMs,
    translateX,
    translateY,
  ]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
