// Aura moods: the colours of each money state, taken from the owner's reference video.
// shape 0 = horizon (an arc low on the screen), 1 = ring (around the big number).

export type Mood = 'calm' | 'ahead' | 'over' | 'shared' | 'pay';

type MoodSpec = { colors: readonly [string, string, string, string, string]; shape: 0 | 1; ink: string };

export const MOODS: Record<Mood, MoodSpec> = {
  calm: { colors: ['#3B2FB8', '#7B3FD6', '#FF7A6B', '#0B1450', '#16C79A'], shape: 0, ink: '#FFFFFF' },
  ahead: { colors: ['#C81E6E', '#F2672E', '#FFB23D', '#3E0E5C', '#E0367A'], shape: 1, ink: '#FFFFFF' },
  over: { colors: ['#2A2BD8', '#D81E86', '#FF3A3A', '#2B157F', '#7428D2'], shape: 1, ink: '#FFFFFF' },
  shared: { colors: ['#C8A2F0', '#F07FB8', '#F5E36A', '#F8F6C8', '#36B36A'], shape: 1, ink: '#141414' },
  pay: { colors: ['#F06AA0', '#F4893A', '#FFD23F', '#FFF3A8', '#F25C5C'], shape: 1, ink: '#141414' },
};

const hex = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];

// 16 floats per mood: 5 rgb colours, then the shape.
export const moodVector = (mood: Mood): number[] => [...MOODS[mood].colors.flatMap(hex), MOODS[mood].shape];

// Spending a bigger share than the share of the cycle gone, by more than this, reads as "faster than the days".
const AHEAD_MARGIN = 0.05;

export const moodForPace = (leftMinor: number, usedShare: number, daysShare: number): Mood => {
  if (leftMinor < 0) return 'over';
  if (usedShare > daysShare + AHEAD_MARGIN) return 'ahead';
  return 'calm';
};
