// Simple ElevenLabs TTS helper for browser usage.
// DEV ONLY: Requires exposing API key to browser via Vite env:
//   VITE_ELEVENLABS_API_KEY=your_key
//   VITE_ELEVENLABS_VOICE_ID=voice_id   (optional; defaults to a common voice)
//
// For production, proxy this call through a backend to keep the key secret.
//

const DEFAULT_VOICE_ID =
  import.meta?.env?.VITE_ELEVENLABS_VOICE_ID ||
  (typeof window !== 'undefined' ? window.localStorage.getItem('VITE_ELEVENLABS_VOICE_ID') : null) ||
  (typeof window !== 'undefined' ? window.ELEVENLABS_VOICE_ID : null) ||
  '21m00Tcm4TlvDq8ikWAM' // "Rachel"
const ELEVEN_BASE_URL = 'https://api.elevenlabs.io/v1'

export async function speakWithElevenLabs(text, options = {}) {
  const apiKey =
    import.meta?.env?.VITE_ELEVENLABS_API_KEY ||
    (typeof window !== 'undefined' ? window.localStorage.getItem('VITE_ELEVENLABS_API_KEY') : null) ||
    (typeof window !== 'undefined' ? window.localStorage.getItem('ELEVENLABS_API_KEY') : null) ||
    (typeof window !== 'undefined' ? window.ELEVENLABS_API_KEY : null)

  if (!apiKey) {
    console.warn('Missing ElevenLabs API key. Set VITE_ELEVENLABS_API_KEY or localStorage key.')
    return
  }

  const voiceId = options.voiceId || DEFAULT_VOICE_ID
  const modelId = options.modelId || 'eleven_multilingual_v2'
  const stability = typeof options.stability === 'number' ? options.stability : 0.4
  const similarityBoost =
    typeof options.similarityBoost === 'number' ? options.similarityBoost : 0.8

  if (import.meta?.env?.DEV) {
    const redacted = apiKey.length > 8 ? apiKey.slice(0, 4) + '...' + apiKey.slice(-4) : '[short]'
    console.log('[ElevenLabs] Using voice:', voiceId, 'model:', modelId, 'key:', redacted)
  }

  const url = `${ELEVEN_BASE_URL}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability,
        similarity_boost: similarityBoost,
      },
    }),
    mode: 'cors',
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    const msg = `ElevenLabs TTS failed: ${res.status} ${errText.slice(0, 200)}`
    console.error(msg)
    throw new Error(msg)
  }

  const blob = await res.blob()
  const audioUrl = URL.createObjectURL(blob)
  // Create a transient audio element to increase playback reliability across browsers
  const audio = document.createElement('audio')
  audio.src = audioUrl
  audio.preload = 'auto'
  audio.autoplay = false
  audio.style.display = 'none'
  document.body.appendChild(audio)
  try {
    await audio.play()
  } catch (err) {
    console.error('Audio play failed:', err)
    // As a fallback, try requiring a subsequent user interaction to call play()
  }

  // Revoke the URL after playback finishes to free memory
  audio.addEventListener(
    'ended',
    () => {
      URL.revokeObjectURL(audioUrl)
      audio.remove()
    },
    { once: true },
  )
}

