// 色相順に並べる(ピッカーで自然な虹色の並びにするため)
export const TAG_COLORS = [
  { key: 'coral', name: '珊瑚' },
  { key: 'apricot', name: '杏' },
  { key: 'sand', name: '砂' },
  { key: 'olive', name: 'オリーブ' },
  { key: 'green', name: '若葉' },
  { key: 'emerald', name: 'エメラルド' },
  { key: 'mint', name: '薄荷' },
  { key: 'teal', name: '青磁' },
  { key: 'blue', name: '水色' },
  { key: 'sky', name: '空' },
  { key: 'lavender', name: '藤' },
  { key: 'plum', name: '茄子' },
  { key: 'rose', name: '紅' },
  { key: 'pink', name: '桜' },
  { key: 'gray', name: '灰' },
];

export function nextUnusedColor(existingTags) {
  const used = new Set(existingTags.map((t) => t.colorKey));
  const free = TAG_COLORS.find((c) => !used.has(c.key));
  return (free || TAG_COLORS[existingTags.length % TAG_COLORS.length]).key;
}

export function tagColorVars(colorKey) {
  return {
    '--tag-bg': `var(--tag-${colorKey}-bg)`,
    '--tag-fg': `var(--tag-${colorKey}-fg)`,
  };
}
