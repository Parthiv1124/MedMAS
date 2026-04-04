"use client";
import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plus, Trash2, MessageSquare, PanelLeft } from "lucide-react";

function groupByDate(sessions) {
  const now = Date.now();
  const D = 86400000;
  const groups = [
    { label: "Today",        items: [] },
    { label: "Yesterday",    items: [] },
    { label: "Last 7 Days",  items: [] },
    { label: "Older",        items: [] },
  ];
  for (const s of sessions) {
    const age = now - new Date(s.updatedAt).getTime();
    if      (age < D)     groups[0].items.push(s);
    else if (age < 2 * D) groups[1].items.push(s);
    else if (age < 7 * D) groups[2].items.push(s);
    else                  groups[3].items.push(s);
  }
  return groups;
}

export default function ChatSidebar({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  isOpen,
  onToggle,
}) {
  const groups = groupByDate(sessions);

  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-30 bg-slate-950/28 backdrop-blur-sm lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onToggle}
          />
        )}
      </AnimatePresence>

      {/* Sidebar panel */}
      <motion.aside
        initial={false}
        animate={{ width: isOpen ? 280 : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 35 }}
        style={{ minWidth: 0, flexShrink: 0 }}
        className="fixed inset-y-0 left-0 z-40 flex h-full flex-col overflow-hidden border-r border-white/50 bg-white/78 shadow-[0_20px_60px_rgba(15,23,42,0.14)] backdrop-blur-2xl lg:relative lg:shadow-none"
      >
        {/* Fixed-width inner — keeps layout stable during animation */}
        <div className="flex h-full w-[280px] flex-col">

          {/* Header row */}
          <div className="border-b border-neutral-200/70 px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-400">Workspace</p>
                <span className="text-sm font-semibold text-neutral-900">Chat History</span>
              </div>
              <button
                onClick={onToggle}
                className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
                title="Collapse sidebar"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-xs leading-5 text-neutral-500">
              Recent conversations stay grouped by time so you can resume quickly.
            </p>
          </div>

          {/* New Chat */}
          <div className="p-3">
            <button
              onClick={onNewChat}
              className="flex w-full items-center gap-2 rounded-2xl border border-white/70 bg-gradient-to-r from-sky-500 to-cyan-400 px-3 py-3 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(14,165,233,0.26)] transition hover:-translate-y-0.5 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              New Chat
            </button>
          </div>

          {/* Sessions list */}
          <div className="no-scrollbar flex-1 overflow-y-auto px-2 pb-4">
            {groups.map(({ label, items }) =>
              items.length === 0 ? null : (
                <div key={label} className="mb-3">
                  <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-400">
                    {label}
                  </p>
                  {items.map((session) => (
                    <SessionItem
                      key={session.id}
                      session={session}
                      isActive={session.id === currentSessionId}
                      onSelect={() => onSelectSession(session.id)}
                      onDelete={() => onDeleteSession(session.id)}
                    />
                  ))}
                </div>
              )
            )}

            {sessions.length === 0 && (
              <div className="flex flex-col items-center gap-2 pt-14 text-center">
                <MessageSquare className="h-9 w-9 text-neutral-300" />
                <p className="text-xs font-medium text-neutral-400">No chats yet</p>
                <p className="text-[11px] text-neutral-300">Your conversations will appear here.</p>
              </div>
            )}
          </div>
        </div>
      </motion.aside>
    </>
  );
}

function SessionItem({ session, isActive, onSelect, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleDeleteClick(e) {
    e.stopPropagation();
    if (confirmDelete) {
      onDelete();
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 2000);
    }
  }

  return (
    <button
      onClick={onSelect}
      className={`group relative flex w-full items-start gap-2 rounded-2xl border px-3 py-2.5 text-left text-sm transition-all ${
        isActive
          ? "border-sky-200 bg-sky-50/90 font-medium text-neutral-900 shadow-sm"
          : "border-transparent text-neutral-600 hover:border-white/70 hover:bg-white/60 hover:text-neutral-800"
      }`}
    >
      <MessageSquare className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isActive ? "text-sky-500" : "text-neutral-300"}`} />

      <span className="flex-1 truncate leading-snug">{session.title}</span>

      <div
        onClick={handleDeleteClick}
        title={confirmDelete ? "Click again to confirm" : "Delete chat"}
        className={`shrink-0 rounded-md p-0.5 opacity-0 transition-all group-hover:opacity-100 ${
          confirmDelete
            ? "bg-red-100 text-red-500 opacity-100"
            : "text-neutral-300 hover:bg-red-50 hover:text-red-500"
        }`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </div>
    </button>
  );
}
