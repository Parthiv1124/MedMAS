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
            className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm lg:hidden"
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
        animate={{ width: isOpen ? 260 : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 35 }}
        style={{ minWidth: 0, flexShrink: 0 }}
        className="relative z-40 flex h-full flex-col overflow-hidden border-r border-neutral-200/70 bg-white/75 backdrop-blur-2xl"
      >
        {/* Fixed-width inner — keeps layout stable during animation */}
        <div className="flex h-full w-[260px] flex-col">

          {/* Header row */}
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
            <span className="text-sm font-semibold text-neutral-800">Chat History</span>
            <button
              onClick={onToggle}
              className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
              title="Collapse sidebar"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          </div>

          {/* New Chat */}
          <div className="p-3">
            <button
              onClick={onNewChat}
              className="flex w-full items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:border-neutral-300 hover:shadow active:scale-[0.98]"
            >
              <Plus className="h-4 w-4 text-neutral-400" />
              New Chat
            </button>
          </div>

          {/* Sessions list */}
          <div className="no-scrollbar flex-1 overflow-y-auto px-2 pb-4">
            {groups.map(({ label, items }) =>
              items.length === 0 ? null : (
                <div key={label} className="mb-3">
                  <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
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
                <MessageSquare className="h-9 w-9 text-neutral-200" />
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
      className={`group relative flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
        isActive
          ? "bg-neutral-100 font-medium text-neutral-900"
          : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-800"
      }`}
    >
      <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-300" />

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
