export function filterSiblingSubtitleEntries(entries, videoPath) {
  const videoName = String(videoPath ?? '').split('/').pop() || ''
  const videoBase = videoName.replace(/\.[^.]+$/, '').toLowerCase()
  const matches = entries.filter((entry) => {
    if (entry.isDirectory || !/\.(ass|ssa|srt|vtt)$/i.test(entry.name)) return false
    const subtitleBase = entry.name.replace(/\.[^.]+$/, '').toLowerCase()
    return subtitleBase === videoBase || subtitleBase.startsWith(videoBase + '.') || subtitleBase.startsWith(videoBase + ' ')
  })
  return matches.sort((left, right) => {
    const leftExact = left.name.replace(/\.[^.]+$/, '').toLowerCase() === videoBase
    const rightExact = right.name.replace(/\.[^.]+$/, '').toLowerCase() === videoBase
    return Number(rightExact) - Number(leftExact) || left.name.localeCompare(right.name)
  })
}
