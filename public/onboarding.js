export const ONBOARDING_STORAGE_KEY = 'shadow-simulator:onboarding:v1';

export const ONBOARDING_STEPS = [
  {
    title: '場所を決める',
    description: '住所を検索するか地図を動かして、日影を確認したい場所を画面の中心に合わせます。',
    target: '使う場所: 地図と検索欄',
  },
  {
    title: '日時を変える',
    description: '右上のメニューから季節・日付・時刻を変えると、その条件の太陽位置と影を確認できます。',
    target: '使う場所: シミュレーション設定',
  },
  {
    title: '2つの状態を比べる',
    description: '比較元を保存してから日時や案を変えると、差分を画面・CSV・Markdownで確認できます。',
    target: '使う場所: 結果・分析 → 比較レポート',
  },
];

function isXMobileEntry(search, width) {
  if (width > 640) return false;
  const params = new URLSearchParams(search || '');
  const source = (params.get('utm_source') || '').toLowerCase();
  const campaign = (params.get('utm_campaign') || '').toLowerCase();
  return source === 'x' || campaign === 'x240cities-v05';
}

export function shouldShowOnboarding({
  storage = globalThis.localStorage,
  search = globalThis.location?.search || '',
  width = globalThis.innerWidth || 1024,
} = {}) {
  if (isXMobileEntry(search, width)) return false;

  try {
    const status = storage?.getItem?.(ONBOARDING_STORAGE_KEY);
    return status !== 'complete' && status !== 'skipped';
  } catch {
    return true;
  }
}

function persistOnboardingStatus(storage, status) {
  try {
    storage?.setItem?.(ONBOARDING_STORAGE_KEY, status);
  } catch {
    // Storage can be unavailable in private/restricted browser contexts.
  }
}

export function setupOnboarding({
  storage = globalThis.localStorage,
  search = globalThis.location?.search || '',
  width = globalThis.innerWidth || 1024,
} = {}) {
  const overlay = document.getElementById('onboardingOverlay');
  const card = document.getElementById('onboardingCard');
  const count = document.getElementById('onboardingStepCount');
  const title = document.getElementById('onboardingTitle');
  const description = document.getElementById('onboardingDescription');
  const target = document.getElementById('onboardingTarget');
  const back = document.getElementById('onboardingBack');
  const next = document.getElementById('onboardingNext');
  const skip = document.getElementById('onboardingSkip');
  const progressItems = Array.from(document.querySelectorAll('[data-onboarding-progress]'));

  if (!overlay || !card || !count || !title || !description || !target || !back || !next || !skip) {
    return null;
  }

  if (!shouldShowOnboarding({ storage, search, width })) {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    return null;
  }

  let stepIndex = 0;
  const previouslyFocused = document.activeElement;

  const analyticsParams = () => ({
    step: stepIndex + 1,
    total_steps: ONBOARDING_STEPS.length,
  });

  const render = () => {
    const step = ONBOARDING_STEPS[stepIndex];
    count.textContent = `${stepIndex + 1} / ${ONBOARDING_STEPS.length}`;
    title.textContent = step.title;
    description.textContent = step.description;
    target.textContent = step.target;
    back.classList.toggle('hidden', stepIndex === 0);
    next.textContent = stepIndex === ONBOARDING_STEPS.length - 1 ? '使ってみる' : '次へ';
    progressItems.forEach((item, index) => {
      item.classList.toggle('is-current', index === stepIndex);
      item.classList.toggle('is-complete', index < stepIndex);
    });
    card.dataset.step = String(stepIndex + 1);
    next.focus();
  };

  const dismiss = (status, eventName) => {
    persistOnboardingStatus(storage, status);
    window.shadowAnalytics?.track?.(eventName, analyticsParams());
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', handleKeydown);
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
  };

  const handleKeydown = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    dismiss('skipped', 'onboarding_skip');
  };

  back.addEventListener('click', () => {
    if (stepIndex === 0) return;
    stepIndex -= 1;
    window.shadowAnalytics?.track?.('onboarding_step', {
      ...analyticsParams(),
      direction: 'back',
    });
    render();
  });

  next.addEventListener('click', () => {
    if (stepIndex === ONBOARDING_STEPS.length - 1) {
      dismiss('complete', 'onboarding_complete');
      return;
    }
    stepIndex += 1;
    window.shadowAnalytics?.track?.('onboarding_step', {
      ...analyticsParams(),
      direction: 'next',
    });
    render();
  });

  skip.addEventListener('click', () => dismiss('skipped', 'onboarding_skip'));
  document.addEventListener('keydown', handleKeydown);

  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  render();
  window.shadowAnalytics?.track?.('onboarding_start', analyticsParams());

  return {
    getStep: () => stepIndex + 1,
    dismiss: () => dismiss('skipped', 'onboarding_skip'),
  };
}
