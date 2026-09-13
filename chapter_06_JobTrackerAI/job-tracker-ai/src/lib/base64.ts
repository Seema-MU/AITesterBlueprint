/** ArrayBuffer ⇄ base64 for JSON backups, so a resume file travels inside the backup. */

export function bytesToBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes)
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < view.length; offset += chunkSize) {
    binary += String.fromCharCode(...view.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const view = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i)
  return view.buffer
}

export function toBlob(bytes: ArrayBuffer, mimeType: string): Blob {
  return new Blob([new Uint8Array(bytes)], { type: mimeType })
}
