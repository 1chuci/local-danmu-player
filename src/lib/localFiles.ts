// 本地文件与文件夹处理：视频/字幕分类、同名匹配、目录遍历

const VIDEO_EXT = /\.(mkv|mp4|webm|avi|mov|m4v|ts)$/i
const SUBTITLE_EXT = /\.(srt|ass|ssa|vtt)$/i

export function isVideoName(name: string): boolean {
  return VIDEO_EXT.test(name)
}

export function isSubtitleName(name: string): boolean {
  return SUBTITLE_EXT.test(name)
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '').toLowerCase()
}

export interface FolderGroup {
  videos: File[]
  subtitlesByBase: Map<string, File>
}

export function groupFolderFiles(files: File[]): FolderGroup {
  const videos: File[] = []
  const subtitlesByBase = new Map<string, File>()
  for (const file of files) {
    if (isVideoName(file.name)) videos.push(file)
    else if (isSubtitleName(file.name)) subtitlesByBase.set(baseName(file.name), file)
  }
  return { videos, subtitlesByBase }
}

export function subtitleForVideo(group: FolderGroup, videoFile: File): File | undefined {
  return group.subtitlesByBase.get(baseName(videoFile.name))
}

function fileFromEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = []
  let batch: FileSystemEntry[]
  do {
    batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
    all.push(...batch)
  } while (batch.length > 0)
  return all
}

export async function collectDroppedFiles(dataTransfer: DataTransfer | null): Promise<File[]> {
  const items = dataTransfer?.items
  const entries: FileSystemEntry[] = []
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.()
      if (entry) entries.push(entry)
    }
  }
  if (entries.length) {
    const files: File[] = []
    const walk = async (entry: FileSystemEntry): Promise<void> => {
      if (entry.isFile) {
        files.push(await fileFromEntry(entry as FileSystemFileEntry))
      } else if (entry.isDirectory) {
        const children = await readAllEntries((entry as FileSystemDirectoryEntry).createReader())
        for (const child of children) await walk(child)
      }
    }
    for (const entry of entries) await walk(entry)
    return files
  }
  return Array.from(dataTransfer?.files || [])
}
