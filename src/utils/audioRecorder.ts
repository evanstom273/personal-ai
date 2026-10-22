export interface RecordedAudio {
	blob: Blob
	durationMs: number
}

export interface ActiveRecording {
	stop: () => Promise<RecordedAudio | null>
	cancel: () => void
}

export function isAudioRecordingSupported(): boolean {
	return (
		typeof MediaRecorder !== 'undefined' &&
		typeof navigator !== 'undefined' &&
		typeof navigator.mediaDevices?.getUserMedia === 'function'
	)
}

/** Records from an open microphone stream until stopped. */
export function startAudioRecording(stream: MediaStream): ActiveRecording {
	const recorder = new MediaRecorder(stream)
	const chunks: Blob[] = []
	const startedAt = Date.now()

	recorder.ondataavailable = (event) => {
		if (event.data.size > 0) {
			chunks.push(event.data)
		}
	}
	recorder.start(250)

	return {
		stop: () =>
			new Promise((resolve) => {
				const finish = () => {
					resolve(
						chunks.length > 0
							? {
									blob: new Blob(chunks, { type: chunks[0]?.type || recorder.mimeType || 'audio/webm' }),
									durationMs: Date.now() - startedAt,
								}
							: null,
					)
				}
				if (recorder.state === 'inactive') {
					finish()
					return
				}
				recorder.onstop = finish
				try {
					recorder.stop()
				} catch {
					finish()
				}
			}),
		cancel: () => {
			recorder.ondataavailable = null
			if (recorder.state !== 'inactive') {
				try {
					recorder.stop()
				} catch {
					// already stopped
				}
			}
		},
	}
}
