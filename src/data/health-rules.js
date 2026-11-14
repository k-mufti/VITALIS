/* Health rules for self check-ins: what counts as OK / Watch / Act, how to measure,
   and why each reading matters in space. Plain words on purpose.
   Status scale matches plan.md 5.2: ok (green) · watch (amber) · act (red). */

export const STATUS_WORD = { ok: 'OK', watch: 'Watch', act: 'Act' };

// Turn a reading into { status, say }. `say` is one plain sentence on what to do.
export const JUDGE = {
  // AHA/ACC 2017 blood pressure guideline (normal < 120/80, stage 2 >= 140/90, crisis > 180/120).
  bp([sys, dia]) {
    if (sys >= 180 || dia >= 120) return { status: 'act', say: 'Very high. Tell the crew doctor now. A copy goes to Earth.' };
    if (sys >= 140 || dia >= 90) return { status: 'act', say: 'High. Rest 5 minutes and measure again. Still high? Tell the crew doctor.' };
    if (sys < 80) return { status: 'act', say: 'Very low. Lie down, drink water and tell the crew doctor.' };
    if (sys >= 130 || dia >= 80) return { status: 'watch', say: 'A little high. Check again tonight.' };
    if (sys < 90) return { status: 'watch', say: 'A little low. Drink water and stand up slowly.' };
    return { status: 'ok', say: 'Normal. Nothing to do.' };
  },
  // ADA Standards of Care: low < 70, serious low < 54 (treat with 15 g fast sugar, recheck in 15 min),
  // random >= 200 mg/dL is high. CGM time-in-range target 70-180 (Battelino et al. 2019).
  glucose(v) {
    if (v < 54) return { status: 'act', say: 'Very low. Eat 15 g of fast sugar now, check again in 15 minutes, tell the crew doctor.' };
    if (v < 70) return { status: 'watch', say: 'Low. Eat 15 g of fast sugar (juice or a glucose tab) and check again in 15 minutes.' };
    if (v >= 200) return { status: 'act', say: 'High. Measure again. Still over 200? Tell the crew doctor.' };
    if (v > 140) return { status: 'watch', say: 'A bit high. Normal right after a meal. Check again 2 hours after eating.' };
    return { status: 'ok', say: 'Normal. Nothing to do.' };
  },
  // Core temperature runs ~1 °C higher during long missions (Stahn et al. 2017, Scientific Reports),
  // so the fever line here sits a little above the usual Earth value.
  temp(v) {
    if (v >= 38.3) return { status: 'act', say: 'Fever. Rest, drink water and tell the crew doctor. Illness spreads fast in a closed cabin.' };
    if (v >= 37.8) return { status: 'watch', say: 'Warmer than usual. Check again in 4 hours.' };
    if (v < 35.5) return { status: 'watch', say: 'Cooler than usual. Warm up and check again in 1 hour.' };
    return { status: 'ok', say: 'Normal. Nothing to do.' };
  },
  // NASA HRP: Risk of Adverse Cognitive or Behavioral Conditions and Psychiatric Disorders.
  mood(v) {
    if (v <= 1) return { status: 'act', say: 'Talk to someone today: the crew doctor, or a private call with your support team on Earth.' };
    if (v === 2) return { status: 'watch', say: 'Rough day. A call home, time with the crew or a window view can help.' };
    return { status: 'ok', say: 'Glad to hear it.' };
  },
  // Symptoms. Vision change: NASA HRP SANS risk (Spaceflight Associated Neuro-ocular Syndrome).
  // Headache: linked to cabin CO2 (Law et al. 2014, NASA). Back pain: spine lengthens in microgravity.
  symptoms(list) {
    if (!list.length || list.includes('None')) return { status: 'ok', say: 'Nothing new. Good.' };
    if (list.includes('Blurry vision')) return { status: 'act', say: 'Vision changes in space can be SANS. Tell the crew doctor today for an eye check.' };
    const tips = {
      'Headache': 'Headaches can come from high cabin CO₂. Drink water and check the air reading.',
      'Back pain': 'Your spine stretches without gravity. Gentle stretches help. Avoid heavy lifting today.',
      'Stuffy nose': 'Fluid shifts to your head in space. Common and usually harmless.',
      'Dizzy': 'Drink water and move slowly. If it lasts, tell the crew doctor.',
      'Sick stomach': 'Common in space. Keep your head still and eat small, plain meals.',
    };
    return { status: 'watch', say: tips[list[0]] || 'Keep an eye on it and log it again tomorrow.' };
  },
};

// How to take each reading, and why it matters in space. `src` = where the numbers come from.
export const GUIDE = {
  bp: {
    how: ['Sit still for 5 minutes with your feet strapped flat.', 'Cuff on your bare upper arm, at heart level.', 'Stay quiet and press start.', 'Take 2 readings, 1 minute apart. Enter the second one.'],
    why: 'Without gravity, blood moves up into your chest and head. Your heart and blood vessels change to match, and that can change your blood pressure.',
    src: 'AHA/ACC 2017 guideline · NASA HRP, cardiovascular risk',
  },
  glucose: {
    how: ['Read the sensor on your arm, or wash your hands and prick a fingertip.', 'Note if you ate in the last 2 hours.'],
    why: 'Moving less and the stress of a mission can make your body handle sugar less well.',
    src: 'ADA Standards of Care · NASA HRP, nutrition and metabolism',
  },
  temp: {
    how: ['Use the ear thermometer.', 'Wait 15 minutes after exercise or a hot drink.'],
    why: 'Bodies run about 1 °C warmer on long missions and cool down slower after exercise. A fever matters more in a closed cabin.',
    src: 'Stahn et al. 2017, Scientific Reports',
  },
  mood: {
    how: ['Pick the word that fits today. There is no wrong answer.', 'Only you and the crew doctor see this.'],
    why: 'Months in a small space far from home can wear anyone down. Small dips caught early are easy to fix.',
    src: 'NASA HRP, behavioral health risk',
  },
  symptoms: {
    how: ['Tap anything you noticed today.'],
    why: 'Some small changes in space, like blurry vision, can point to bigger problems.',
    src: 'NASA HRP, SANS risk · Law et al. 2014 (CO₂ and headaches)',
  },
  // Body systems in the detail view.
  heart: {
    how: ['Your watch measures this all day. For a resting reading, lie still for 5 minutes after waking.'],
    why: 'Without gravity your heart works less and can shrink a little. A resting rate that climbs for days can mean poor sleep, stress or getting sick.',
    src: 'NASA HRP, cardiovascular risk',
  },
  lungs: {
    how: ['Your watch measures breathing and oxygen. For a spot check, sit still and use the finger clip.'],
    why: 'Cabin air is recycled. High CO₂ or dust from Mars can make breathing harder.',
    src: 'NASA-STD-3001 Vol. 2 (cabin air)',
  },
  sleep: {
    how: ['Wear your watch to bed. Each morning, rate how rested you feel.'],
    why: 'Noise, light and odd schedules make sleep hard in space. Poor sleep slows reactions and raises the chance of mistakes.',
    src: 'NASA HRP, sleep loss risk',
  },
  muscles: {
    how: ['Log each workout. Strength tests run every 2 weeks in the med bay.'],
    why: 'Without gravity, muscles and bones weaken fast. About 2 hours of exercise a day keeps them strong.',
    src: 'NASA HRP, muscle and bone loss risk',
  },
};
