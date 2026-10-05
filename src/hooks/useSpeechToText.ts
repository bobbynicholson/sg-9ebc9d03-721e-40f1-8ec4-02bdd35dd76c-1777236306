import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser speech-to-text via the Web Speech API (Chrome, Edge, Safari).
 * Audio is handled by the browser; nothing new is sent to our backend.
 * Firefox has no support, so callers should hide the control when
 * `supported` is false.
 */

type SpeechRecognitionResultLike = { isFinal: boolean; 0: { transcript: string } };
type SpeechRecognitionEventLike = { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionErrorLike = { error: string };
type SpeechRecognitionLike = {
  lang: string;
  maxAlternatives: number;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it in your browser settings to speak.",
  "service-not-allowed": "Microphone access is blocked. Allow it in your browser settings to speak.",
  "audio-capture": "No microphone was found.",
  "network": "Voice input needs an internet connection.",
  "no-speech": "Didn't catch that. Tap the mic and try again.",
};

/** idle -> starting (waiting for mic permission) -> listening -> finishing -> idle */
export type SpeechStatus = "idle" | "starting" | "listening" | "finishing";

export function useSpeechToText({
  onInterim,
  onFinal,
}: {
  /** Live text while the person is still speaking. */
  onInterim?: (text: string) => void;
  /** Full text once they stop speaking (empty string if nothing was heard). */
  onFinal: (text: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTextRef = useRef("");
  const cancelledRef = useRef(false);
  // Keep the latest callbacks without restarting recognition.
  const onInterimRef = useRef(onInterim);
  const onFinalRef = useRef(onFinal);
  onInterimRef.current = onInterim;
  onFinalRef.current = onFinal;

  useEffect(() => {
    setSupported(Boolean(getRecognitionCtor()));
    return () => recognitionRef.current?.abort();
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || recognitionRef.current) return;
    const recognition = new Ctor();
    recognition.lang = (typeof navigator !== "undefined" && navigator.language) || "en-ZA";
    // Keep listening through natural pauses; the person taps the mic
    // again to finish. Auto-stop mid-sentence produced half questions.
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    finalTextRef.current = "";
    cancelledRef.current = false;
    setError(null);

    recognition.onresult = (event) => {
      // Rebuild the whole transcript from every result each time.
      // Appending only new final chunks duplicated or dropped words
      // when the engine revised earlier phrases.
      let finalText = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const piece = result[0].transcript.trim();
        if (!piece) continue;
        if (result.isFinal) finalText += `${piece} `;
        else interim += `${piece} `;
      }
      finalTextRef.current = finalText.trim();
      onInterimRef.current?.(`${finalText}${interim}`.replace(/s+/g, " ").trim());
    };
    recognition.onerror = (event) => {
      if (event.error === "aborted") return;
      if (event.error === "no-speech" && finalTextRef.current) return;
      setError(ERROR_MESSAGES[event.error] || "Voice input stopped. Please try again.");
    };
    recognition.onstart = () => setStatus("listening");
    recognition.onend = () => {
      recognitionRef.current = null;
      setStatus("idle");
      if (!cancelledRef.current) onFinalRef.current(finalTextRef.current.trim());
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setStatus("starting");
    } catch {
      recognitionRef.current = null;
      setError("Voice input could not start. Please try again.");
    }
  }, []);

  /** Stop listening and keep what was heard (onFinal fires). */
  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    setStatus("finishing");
    recognitionRef.current.stop();
  }, []);

  /** Stop listening and discard what was heard. */
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    recognitionRef.current?.abort();
  }, []);

  // "listening" covers every state where the mic is (or is about to be) open.
  const listening = status !== "idle";
  return { supported, status, listening, error, clearError: () => setError(null), start, stop, cancel };
}
