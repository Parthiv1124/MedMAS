from datetime import datetime, timezone

from config import supabase


def _check_supabase():
    if not supabase:
        raise RuntimeError("Supabase not configured")


def list_chat_sessions(user_id: str) -> list:
    _check_supabase()
    result = (
        supabase.table("chat_sessions")
        .select("id,user_id,title,tab,session_context,created_at,updated_at")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .execute()
    )
    return result.data or []


def get_chat_session(user_id: str, session_id: str) -> dict:
    _check_supabase()
    session_res = (
        supabase.table("chat_sessions")
        .select("id,user_id,title,tab,session_context,created_at,updated_at")
        .eq("user_id", user_id)
        .eq("id", session_id)
        .limit(1)
        .execute()
    )
    sessions = session_res.data or []
    messages_res = (
        supabase.table("chat_messages")
        .select("id,session_id,user_id,role,content,meta,created_at")
        .eq("user_id", user_id)
        .eq("session_id", session_id)
        .order("created_at")
        .execute()
    )
    return {
        "session": sessions[0] if sessions else None,
        "messages": messages_res.data or [],
    }


def save_chat_exchange(
    *,
    user_id: str,
    session_id: str,
    title: str,
    tab: str,
    session_context: dict | None,
    user_message: dict,
    assistant_message: dict,
) -> None:
    _check_supabase()
    now = datetime.now(timezone.utc).isoformat()

    supabase.table("chat_sessions").upsert(
        {
            "id": session_id,
            "user_id": user_id,
            "title": title or "New Chat",
            "tab": tab or "chat",
            "session_context": session_context or {},
            "updated_at": now,
        }
    ).execute()

    rows = [
        {
            "session_id": session_id,
            "user_id": user_id,
            "role": "user",
            "content": user_message.get("content", ""),
            "meta": user_message.get("meta", {}) or {},
        },
        {
            "session_id": session_id,
            "user_id": user_id,
            "role": "assistant",
            "content": assistant_message.get("content", ""),
            "meta": assistant_message.get("meta", {}) or {},
        },
    ]
    supabase.table("chat_messages").insert(rows).execute()

    supabase.table("chat_sessions").update(
        {
            "title": title or "New Chat",
            "tab": tab or "chat",
            "session_context": session_context or {},
            "updated_at": now,
        }
    ).eq("user_id", user_id).eq("id", session_id).execute()


def delete_chat_session(user_id: str, session_id: str) -> None:
    _check_supabase()
    supabase.table("chat_messages").delete().eq("user_id", user_id).eq("session_id", session_id).execute()
    supabase.table("chat_sessions").delete().eq("user_id", user_id).eq("id", session_id).execute()
