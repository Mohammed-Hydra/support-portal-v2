import { useEffect, useRef } from "react";
import { supabase } from "../supabase";

/**
 * Subscribe to new ticket_messages for a ticket via Supabase Realtime.
 * Calls onNewMessage when a new message is inserted.
 * @param {number|string|null} ticketId - Ticket ID to subscribe to
 * @param {(msg: object) => void} onNewMessage - Callback with new message (id, body, source, created_at, etc.)
 * @param {{ isRequester?: boolean }} options - If isRequester, only non-internal messages are reported
 */
export function useTicketMessagesRealtime(ticketId, onNewMessage, options = {}) {
  const { isRequester = false } = options;
  const callbackRef = useRef(onNewMessage);
  callbackRef.current = onNewMessage;

  useEffect(() => {
    if (!supabase || !ticketId) return;

    const channel = supabase
      .channel(`ticket-messages-${ticketId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_messages",
          filter: `ticket_id=eq.${Number(ticketId)}`,
        },
        (payload) => {
          const row = payload?.new;
          if (!row) return;
          if (isRequester && row.is_internal) return;
          const msg = {
            id: row.id,
            ticket_id: row.ticket_id,
            author_user_id: row.author_user_id,
            source: row.source || "",
            body: row.body || "",
            attachment_url: row.attachment_url || null,
            is_internal: Boolean(row.is_internal),
            created_at: row.created_at,
            author_name: null,
          };
          callbackRef.current?.(msg);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId, isRequester]);
}
