export const SlotConfig = {
  design: {
    width: 1280,
    height: 720,
  },
  reels: {
    count: 5,
    rows: 3,
    symbolSize: 140,
    symbolGap: 18,
    // Extra symbols above/below for smooth motion.
    buffer: 2,
    // How many random steps before landing on result.
    baseSteps: 24,
    stepStagger: 6,
    baseDuration: 1.25,
    durationStagger: 0.18,
  },
  layout: {
    panelWidth: 900,
    panelHeight: 520,
    panelRadius: 34,
    uiBottomMargin: 40,
  },
  fx: {
    winPulseTime: 0.35,
    winHoldTime: 0.9,
  },
} as const;

