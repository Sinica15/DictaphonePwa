import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react'
import './App.css'

const TRANSCRIPTION_URL = 'https://api.mistral.ai/v1/audio/transcriptions'
const DEFAULT_MODEL = 'voxtral-mini-latest'
const ENV_API_KEY = (import.meta.env.VITE_MISTRAL_API_KEY ?? '').trim()

type Note = {
  id: string
  createdAt: string
  seconds: number
  text: string
}

const extensionFromMime = (mimeType: string): string => {
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('mpeg')) return 'mp3'
  if (mimeType.includes('wav')) return 'wav'
  return 'webm'
}

const pickMimeType = (): string | undefined => {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate))
}

function App() {
  const [apiKey, setApiKey] = useState(ENV_API_KEY)
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [language, setLanguage] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [draftText, setDraftText] = useState('')
  const [notes, setNotes] = useState<Note[]>([])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef<number | null>(null)
  const pressLockRef = useRef(false)

  const stopStream = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null
  }

  const requireApiKey = (): string | null => {
    const key = apiKey.trim()
    if (!key) {
      setErrorText('Нужен Mistral API key: поле или VITE_MISTRAL_API_KEY.')
      return null
    }
    return key
  }

  const transcribe = async (blob: Blob, fileName: string): Promise<string> => {
    const key = requireApiKey()
    if (!key) {
      return ''
    }

    const formData = new FormData()
    formData.append('model', model.trim() || DEFAULT_MODEL)
    formData.append('file', blob, fileName)
    if (language.trim()) {
      formData.append('language', language.trim())
    }

    const response = await fetch(TRANSCRIPTION_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: formData,
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload?.message || payload?.error || 'Mistral transcription failed')
    }
    return String(payload?.text || '').trim()
  }

  const startRecording = async () => {
    if (isRecording || isTranscribing) {
      return
    }
    setErrorText('')

    const key = requireApiKey()
    if (!key) {
      return
    }

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setErrorText(
        'Микрофон недоступен: открой приложение в secure context (HTTPS или localhost). На телефоне по http://IP запись не работает.',
      )
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = pickMimeType()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)

      chunksRef.current = []
      startedAtRef.current = Date.now()
      mediaRecorderRef.current = recorder
      mediaStreamRef.current = stream

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onerror = () => {
        setErrorText('Ошибка записи с микрофона.')
        setIsRecording(false)
        stopStream()
      }

      recorder.onstop = async () => {
        const startedAt = startedAtRef.current
        startedAtRef.current = null
        setIsRecording(false)
        stopStream()

        const durationSeconds = startedAt
          ? Math.max(1, Math.round((Date.now() - startedAt) / 1000))
          : 1
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || chunksRef.current[0]?.type || 'audio/webm',
        })
        chunksRef.current = []

        if (!blob.size) {
          setErrorText('Пустая запись, попробуй снова.')
          return
        }

        setIsTranscribing(true)
        try {
          const ext = extensionFromMime(blob.type || '')
          const text = await transcribe(blob, `note-${Date.now()}.${ext}`)
          if (text) {
            setDraftText(text)
            setNotes((prev) => [
              {
                id: `${Date.now()}`,
                createdAt: new Date().toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                seconds: durationSeconds,
                text,
              },
              ...prev,
            ])
          } else {
            setErrorText('STT вернул пустой текст.')
          }
        } catch (error) {
          setErrorText(error instanceof Error ? error.message : 'Ошибка транскрибации')
        } finally {
          setIsTranscribing(false)
        }
      }

      recorder.start()
      setIsRecording(true)
    } catch (error) {
      stopStream()
      setIsRecording(false)
      setErrorText(error instanceof Error ? error.message : 'Нет доступа к микрофону.')
    }
  }

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      return
    }
    recorder.stop()
    mediaRecorderRef.current = null
  }

  const handlePressStart = async (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    if (pressLockRef.current) {
      return
    }
    pressLockRef.current = true
    await startRecording()
  }

  const handlePressEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!pressLockRef.current) {
      return
    }
    pressLockRef.current = false
    stopRecording()
  }

  const handleTouchStart = (event: ReactTouchEvent<HTMLButtonElement>) => {
    event.preventDefault()
  }

  return (
    <main className="app">
      <header className="head">
        <h1>Voice Notes</h1>
        <p className="muted">PWA диктофон: удерживай кнопку, говори, отпусти для STT.</p>
      </header>

      <section className="panel">
        <label htmlFor="api-key">Mistral API key</label>
        <input
          id="api-key"
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="paste_mistral_api_key_here"
          autoComplete="off"
        />
        {ENV_API_KEY ? <p className="muted tiny">Ключ подтянут из `.env`.</p> : null}

        <label htmlFor="model">Model</label>
        <input
          id="model"
          type="text"
          value={model}
          onChange={(event) => setModel(event.target.value)}
          placeholder={DEFAULT_MODEL}
        />

        <label htmlFor="language">Language (optional)</label>
        <input
          id="language"
          type="text"
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          placeholder="ru / en / ..."
        />
      </section>

      <section className="panel recorder-panel">
        <button
          className={`record-button ${isRecording ? 'recording' : ''}`}
          type="button"
          onPointerDown={handlePressStart}
          onPointerUp={handlePressEnd}
          onPointerCancel={handlePressEnd}
          onTouchStart={handleTouchStart}
          onContextMenu={(event) => event.preventDefault()}
        >
          {isRecording ? 'Recording...' : 'Hold To Record'}
        </button>
        <p className="status">
          {isRecording
            ? 'Запись идет, держи кнопку.'
            : isTranscribing
              ? 'Транскрибирую...'
              : 'Готово к записи.'}
        </p>
      </section>

      {errorText ? (
        <section className="panel error" role="alert">
          {errorText}
        </section>
      ) : null}

      <section className="panel">
        <h2>Last Transcript</h2>
        <pre className="result">{draftText || 'Пока пусто.'}</pre>
      </section>

      <section className="panel">
        <h2>Notes</h2>
        {notes.length === 0 ? (
          <p className="muted">Записей пока нет.</p>
        ) : (
          <ul className="notes">
            {notes.map((note) => (
              <li key={note.id} className="note">
                <div className="note-meta">
                  <span>{note.createdAt}</span>
                  <span>{note.seconds}s</span>
                </div>
                <p>{note.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

export default App
