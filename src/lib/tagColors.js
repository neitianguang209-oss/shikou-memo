export const TAG_COLORS = [
  { key: 'blue', name: '水色' },
  { key: 'green', name: '若葉' },
  { key: 'lavender', name: '藤' },
  { key: 'apricot', name: '杏' },
  { key: 'pink', name: '桜' },
  { key: 'mint', name: '薄荷' },
  { key: 'sand', name: '砂' },
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
