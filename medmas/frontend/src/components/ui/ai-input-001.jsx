"use client";;
import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  Send,
  Image as ImageIcon,
  FileText,
  Layers,
  Mic,
  Square,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const AiInput = ({
  messages = [],
  onSendMessage = () => {},
  models = [],
  backgroundText = "Skiper Input 001",
  placeholder = "Ask anything...",
}) => {
  const hasMessages = messages.length > 0;
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      className="relative flex h-screen w-full flex-col overflow-hidden bg-neutral-50 dark:bg-neutral-950">
      <AnimatePresence>
        {!hasMessages && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.5 }}
            className="pointer-events-none absolute inset-0 z-0 mb-10 flex items-end justify-center select-none">
            <h1
              className="text-xl font-bold text-neutral-300/40 sm:text-5xl md:text-[150px] dark:text-neutral-800/40">
              {backgroundText}
            </h1>
          </motion.div>
        )}
      </AnimatePresence>
      <MessageList messages={messages} scrollRef={scrollRef} />
      <ChatInput
        models={models}
        placeholder={placeholder}
        hasMessages={hasMessages}
        onSend={onSendMessage} />
    </div>
  );
};

const MessageList = ({
  messages,
  scrollRef
}) => {
  if (!messages.length) return null;

  return (
    <div
      ref={scrollRef}
      className="z-10 flex w-full flex-1 flex-col items-center overflow-y-auto pt-6 sm:pt-10">
      <div
        className="flex w-full max-w-3xl flex-col gap-4 px-3 pb-6 sm:px-4 sm:pb-10">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`flex ${
                msg.sender === "user" ? "justify-end" : "justify-start"
              }`}>
              <div
                className={`max-w-[85%] rounded-2xl border px-3 py-2 text-sm font-medium shadow-sm sm:max-w-[80%] sm:px-4 sm:text-[15px] ${
                  msg.sender === "user"
                    ? "rounded-tr-none border-neutral-900 bg-neutral-900 text-white dark:border-neutral-700 dark:bg-neutral-800"
                    : "rounded-tl-none border-neutral-200 bg-white text-neutral-800 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
                }`}>
                {msg.text}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export const ChatInput = ({
  models,
  hasMessages,
  placeholder,
  onSend,
  onTranscribe,
  disabled = false,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const textAreaRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    if (textAreaRef.current) {
      textAreaRef.current.style.height = "auto";
      textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
    }
  }, [inputValue]);

  const handleSend = () => {
    if (disabled || !inputValue.trim()) return;
    onSend(inputValue);
    setInputValue("");
  };

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const stopMediaStream = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  };

  const startRecording = async () => {
    if (!onTranscribe) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      window.alert("Audio recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsRecording(false);
        const blobType = recorder.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: blobType });
        audioChunksRef.current = [];
        stopMediaStream();

        if (!blob.size) {
          return;
        }

        setIsTranscribing(true);
        try {
          const text = await onTranscribe(blob);
          if (text) {
            setInputValue((prev) => (prev ? `${prev} ${text}`.trim() : text));
          }
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (error) {
      stopMediaStream();
      setIsRecording(false);
      window.alert(error?.message || "Could not start audio recording.");
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  };

  const handleMicClick = () => {
    if (disabled) {
      return;
    }
    if (isTranscribing) {
      return;
    }
    if (isRecording) {
      stopRecording();
      return;
    }
    void startRecording();
  };

  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 200, damping: 25 }}
      className={`z-20 flex w-full justify-center px-3 py-3 sm:px-4 sm:py-4 ${
        !hasMessages ? "flex-1 items-center" : "items-end"
      }`}>
      <motion.div
        layout
        className="glass-liquid-strong w-full max-w-5xl rounded-2xl border border-white/50 p-2.5 shadow-lg sm:rounded-[24px] sm:p-3">
        <textarea
          ref={textAreaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={placeholder}
          className={`mb-2 max-h-[160px] min-h-[40px] w-full resize-none bg-transparent px-1 text-sm font-semibold text-neutral-900 outline-none placeholder:text-neutral-500 sm:max-h-[200px] sm:min-h-[44px] sm:px-2 sm:text-base ${
            disabled ? "cursor-not-allowed opacity-60" : ""
          }`}
          rows={1} />

        <div
          className="glass-liquid mt-2 flex items-center justify-between gap-2 rounded-xl border border-white/40 p-2">
          <div className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto sm:gap-2">
            <AttachmentMenu />
            <button
              type="button"
              onClick={handleMicClick}
              disabled={disabled || !onTranscribe || isTranscribing}
              className={`shrink-0 rounded-lg border p-2 transition-colors sm:p-2.5 ${
                isRecording
                  ? "border-red-300 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400"
                  : "border-neutral-200 bg-neutral-100 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400"
              } ${(disabled || !onTranscribe || isTranscribing) ? "cursor-not-allowed opacity-60" : ""}`}
              title={isRecording ? "Stop recording" : "Record voice message"}>
              {isRecording ? <Square className="h-4 w-4 sm:h-5 sm:w-5" /> : <Mic className="h-4 w-4 sm:h-5 sm:w-5" />}
            </button>
            {(isRecording || isTranscribing) && (
              <span className="truncate text-[11px] font-medium text-neutral-500 dark:text-neutral-400 sm:text-xs">
                {isRecording ? "Recording..." : "Transcribing..."}
              </span>
            )}
          </div>

          <button
            onClick={handleSend}
            disabled={disabled || !inputValue.trim()}
            className={`shrink-0 rounded-lg p-2 transition-colors sm:p-3 ${
              !disabled && inputValue.trim()
                ? "glass-liquid-accent text-neutral-950"
                : "cursor-not-allowed border border-white/30 bg-white/30 text-neutral-400 dark:bg-white/5 dark:text-neutral-500"
            }`}>
            <Send className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const ATTACHMENT_ITEMS = [
  { label: "Images", icon: ImageIcon },
  { label: "Documents", icon: FileText },
  { label: "Connect Apps", icon: Layers },
];

const AttachmentMenu = () => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={<button
        className="group rounded-lg border border-neutral-200 bg-neutral-100 p-2 text-neutral-500 sm:p-2.5 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400" />}><Plus
      className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-45 sm:h-5 sm:w-5" /></DropdownMenuTrigger>

    <DropdownMenuContent
      align="start"
      side="bottom"
      className="mt-5.5 w-44 rounded-xl border border-neutral-200 bg-white p-2 sm:w-48 dark:border-neutral-800 dark:bg-neutral-900">
      {ATTACHMENT_ITEMS.map(({ label, icon: Icon }) => (
        <DropdownMenuItem
          key={label}
          className="flex items-center gap-2 p-2 text-sm text-neutral-700 dark:text-neutral-200">
          <Icon className="h-4 w-4 shrink-0" />
          {label}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

