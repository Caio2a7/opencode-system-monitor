type ReadText = (path: string) => Promise<string>
type ListDir = (path: string) => Promise<string[]>

const PCI_DEVICES = "/sys/bus/pci/devices"
const NVIDIA_VENDOR = "0x10de"
const DISPLAY_CLASS = "0x03"

const readTrimmed = (read: ReadText, path: string): Promise<string> =>
  read(path).then(
    (text) => text.trim(),
    () => "",
  )

export async function findNvidiaGpus(read: ReadText, list: ListDir): Promise<string[]> {
  const dirs = (await list(PCI_DEVICES).catch(() => [])).map((name) => `${PCI_DEVICES}/${name}`)
  const matches = await Promise.all(
    dirs.map(async (dir) => {
      const [vendor, cls] = await Promise.all([readTrimmed(read, `${dir}/vendor`), readTrimmed(read, `${dir}/class`)])
      return vendor === NVIDIA_VENDOR && cls.startsWith(DISPLAY_CLASS)
    }),
  )
  return dirs.filter((_, i) => matches[i])
}

export async function allSuspended(read: ReadText, gpus: readonly string[]): Promise<boolean> {
  if (gpus.length === 0) return false
  const states = await Promise.all(gpus.map((dir) => readTrimmed(read, `${dir}/power/runtime_status`)))
  return states.every((state) => state === "suspended")
}
