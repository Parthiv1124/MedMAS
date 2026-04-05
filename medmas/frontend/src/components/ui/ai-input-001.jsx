"use client";;
import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  Send,
  Image as ImageIcon,
  FileText,
  Layers,
  Mic,
  Square,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const AiInput = ({
  messages = [],
  onSendMessage = () => { },
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
      className="relative flex h-screen w-full flex-col overflow-hidden bg-slate-50">
      <AnimatePresence>
        {!hasMessages && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.5 }}
            className="pointer-events-none absolute inset-0 z-0 mb-10 flex items-end justify-center select-none">
            <h1
              className="text-xl font-bold text-slate-200 sm:text-5xl md:text-[150px]">
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
              className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"
                }`}>
              <div
                className={`max-w-[85%] rounded-2xl border px-3 py-2 text-sm font-medium shadow-sm sm:max-w-[80%] sm:px-4 sm:text-[15px] ${msg.sender === "user"
                    ? "rounded-tr-none border-brand-200 bg-brand-50 text-brand-900"
                    : "rounded-tl-none border-slate-200 bg-white text-slate-800"
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
  const [attachments, setAttachments] = useState([]);

  const textAreaRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const imageInputRef = useRef(null);
  const docInputRef = useRef(null);

  useEffect(() => {
    if (textAreaRef.current) {
      textAreaRef.current.style.height = "auto";
      textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
    }
  }, [inputValue]);

  const handleSend = () => {
    if (!inputValue.trim() && attachments.length === 0) return;
    onSend(inputValue, attachments.map((a) => a.file));
    setInputValue("");
    setAttachments([]);
  };

  const handleFiles = useCallback((files, type) => {
    const newAttachments = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      type,
      preview: type === "image" ? URL.createObjectURL(file) : null,
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  const removeAttachment = useCallback((id) => {
    setAttachments((prev) => {
      const removed = prev.find((a) => a.id === id);
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

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
    <div className="z-20 mx-auto w-full max-w-5xl px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3">
      <div className="w-full rounded-[26px] border border-slate-200 bg-white p-3 shadow-lg sm:rounded-[30px] sm:p-4">
        {/* Hidden file inputs */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files, "image"); e.target.value = ""; }}
        />
        <input
          ref={docInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx"
          multiple
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files, "document"); e.target.value = ""; }}
        />

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
          className={`mb-2 max-h-[160px] min-h-[40px] w-full resize-none bg-transparent px-1 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 sm:max-h-[200px] sm:min-h-[44px] sm:px-2 sm:text-base ${
            disabled ? "cursor-not-allowed opacity-60" : ""
          }`}
          rows={1} />

        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2 px-1 sm:px-2">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="group relative flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1.5 pr-7">
                {att.type === "image" ? (
                  <img src={att.preview} alt="" className="h-10 w-10 rounded-md object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-200">
                    <FileText className="h-5 w-5 text-slate-500" />
                  </div>
                )}
                <span className="max-w-[120px] truncate text-xs font-medium text-slate-600">
                  {att.file.name}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  className="absolute right-1 top-1 rounded-full bg-slate-200 p-0.5 text-slate-500 opacity-0 transition-opacity hover:bg-slate-300 group-hover:opacity-100">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-2">
          <div className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto sm:gap-2">
            <AttachmentMenu
              onImageClick={() => imageInputRef.current?.click()}
              onDocClick={() => docInputRef.current?.click()}
            />
            <button
              type="button"
              onClick={handleMicClick}
              disabled={disabled || !onTranscribe || isTranscribing}
              className={`shrink-0 rounded-lg border p-2 transition-colors sm:p-2.5 ${
                isRecording
                  ? "border-red-300 bg-red-50 text-red-600"
                  : "border-slate-200 bg-white text-slate-500"
              } ${(disabled || !onTranscribe || isTranscribing) ? "cursor-not-allowed opacity-60" : ""}`}
              title={isRecording ? "Stop recording" : "Record voice message"}>
              {isRecording ? <Square className="h-4 w-4 sm:h-5 sm:w-5" /> : <Mic className="h-4 w-4 sm:h-5 sm:w-5" />}
            </button>
            {(isRecording || isTranscribing) && (
              <span className="truncate text-[11px] font-medium text-slate-500 sm:text-xs">
                {isRecording ? "Recording..." : "Transcribing..."}
              </span>
            )}
          </div>

          <button
            onClick={handleSend}
            disabled={disabled || (!inputValue.trim() && attachments.length === 0)}
            className={`shrink-0 rounded-lg p-2 transition-colors sm:p-3 ${
              !disabled && (inputValue.trim() || attachments.length > 0)
                ? "bg-gradient-to-r from-brand-600 to-teal-500 text-white"
                : "cursor-not-allowed border border-slate-200 bg-slate-50 text-slate-400"
              }`}>
            <Send className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

const AttachmentMenu = ({ onImageClick, onDocClick }) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={<button
        className="group rounded-lg border border-slate-200 bg-white p-2 text-slate-500 sm:p-2.5" />}><Plus
        className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-45 sm:h-5 sm:w-5" /></DropdownMenuTrigger>

    <DropdownMenuContent
      align="start"
      side="bottom"
      className="mt-5.5 w-44 rounded-xl border border-slate-200 bg-white p-2 sm:w-48">
      <DropdownMenuItem
        onClick={onImageClick}
        className="flex cursor-pointer items-center gap-2 p-2 text-sm text-slate-700">
        <ImageIcon className="h-4 w-4 shrink-0" />
        Images
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={onDocClick}
        className="flex cursor-pointer items-center gap-2 p-2 text-sm text-slate-700">
        <FileText className="h-4 w-4 shrink-0" />
        Documents
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

