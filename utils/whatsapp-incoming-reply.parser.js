import {
  INCOMING_REPLY_CATEGORIES,
  REPLY_FILE_TYPES,
} from './whatsapp-incoming-reply.constants.js';

/**
 * Normalized DTO for an inbound user selection (template quick-reply, interactive button, or list item).
 *
 * @typedef {Object} IncomingReplyDTO
 * @property {string} category - One of INCOMING_REPLY_CATEGORIES
 * @property {string|null} id - Stable identifier (interactive button/list id, or template button payload/text)
 * @property {string|null} title - Human-readable label shown to the user
 * @property {string|null} description - List reply description (if any)
 * @property {string|null} payload - Template quick-reply payload (same as label text per Meta)
 * @property {string} metaMessageType - Original message.type from webhook
 * @property {string|null} metaInteractiveType - interactive.type when message.type === "interactive"
 * @property {string} fileType - Value to persist on Message.file_type
 * @property {Object|null} raw - Raw button_reply | list_reply | button object from webhook
 */

/**
 * Parse template quick-reply (Custom) — Meta webhook type "button".
 * Payload and text are both the button label; there is no separate id field.
 */
function parseTemplateQuickReply(message) {
  const button = message?.button;
  if (!button) return null;

  const label = button.text || button.payload || null;
  const payload = button.payload || button.text || null;

  return {
    category: INCOMING_REPLY_CATEGORIES.TEMPLATE_QUICK_REPLY,
    id: payload,
    title: label,
    description: null,
    payload,
    metaMessageType: message.type,
    metaInteractiveType: null,
    fileType: REPLY_FILE_TYPES[INCOMING_REPLY_CATEGORIES.TEMPLATE_QUICK_REPLY],
    raw: button,
  };
}

/**
 * Parse interactive reply button — sent via Cloud API interactive messages.
 * Distinct from template quick-replies which use message.type === "button".
 */
function parseInteractiveButtonReply(message) {
  const buttonReply = message?.interactive?.button_reply;
  if (!buttonReply) return null;

  return {
    category: INCOMING_REPLY_CATEGORIES.INTERACTIVE_BUTTON_REPLY,
    id: buttonReply.id || null,
    title: buttonReply.title || null,
    description: null,
    payload: null,
    metaMessageType: message.type,
    metaInteractiveType: message.interactive?.type || 'button_reply',
    fileType: REPLY_FILE_TYPES[INCOMING_REPLY_CATEGORIES.INTERACTIVE_BUTTON_REPLY],
    raw: buttonReply,
  };
}

/**
 * Parse interactive list menu selection.
 */
function parseInteractiveListReply(message) {
  const listReply = message?.interactive?.list_reply;
  if (!listReply) return null;

  return {
    category: INCOMING_REPLY_CATEGORIES.INTERACTIVE_LIST_REPLY,
    id: listReply.id || null,
    title: listReply.title || null,
    description: listReply.description || null,
    payload: null,
    metaMessageType: message.type,
    metaInteractiveType: message.interactive?.type || 'list_reply',
    fileType: REPLY_FILE_TYPES[INCOMING_REPLY_CATEGORIES.INTERACTIVE_LIST_REPLY],
    raw: listReply,
  };
}

/**
 * Extract a normalized inbound reply from a Meta messages webhook payload.
 * Returns null for non-reply message types (text, image, etc.).
 *
 * @param {Object} message - value.messages[0] from Meta webhook
 * @returns {IncomingReplyDTO|null}
 */
export function parseIncomingReply(message) {
  if (!message?.type) return null;

  // Template quick-reply (Custom) — MUST be checked before interactive because
  // these are type "button", not type "interactive".
  if (message.type === 'button') {
    return parseTemplateQuickReply(message);
  }

  if (message.type === 'interactive') {
    const interactiveType = message.interactive?.type;

    if (interactiveType === 'button_reply') {
      return parseInteractiveButtonReply(message);
    }

    if (interactiveType === 'list_reply') {
      return parseInteractiveListReply(message);
    }
  }

  return null;
}

/**
 * Map category to the value exposed on automation quick_reply.type / interactive_reply_type.
 * Keeps "button_reply" for interactive buttons for backward compatibility with existing flows.
 */
export function getAutomationReplyType(reply) {
  if (!reply) return null;

  switch (reply.category) {
    case INCOMING_REPLY_CATEGORIES.TEMPLATE_QUICK_REPLY:
      return INCOMING_REPLY_CATEGORIES.TEMPLATE_QUICK_REPLY;
    case INCOMING_REPLY_CATEGORIES.INTERACTIVE_BUTTON_REPLY:
      return 'button_reply';
    case INCOMING_REPLY_CATEGORIES.INTERACTIVE_LIST_REPLY:
      return 'list_reply';
    default:
      return reply.metaInteractiveType || reply.metaMessageType || null;
  }
}

/**
 * Build automation-friendly event fields from a parsed reply DTO.
 */
export function toAutomationReplyFields(reply) {
  if (!reply) {
    return {
      interactive_reply_id: null,
      interactive_reply_title: null,
      interactive_reply_type: null,
      interactive_reply_description: null,
      reply_category: null,
      reply_payload: null,
    };
  }

  return {
    interactive_reply_id: reply.id,
    interactive_reply_title: reply.title,
    interactive_reply_type: getAutomationReplyType(reply),
    interactive_reply_description: reply.description,
    reply_category: reply.category,
    reply_payload: reply.payload,
  };
}

/**
 * Log which reply path was detected (template quick-reply vs interactive vs list).
 */
export function logIncomingReply(reply, from) {
  if (!reply) return;

  const labels = {
    [INCOMING_REPLY_CATEGORIES.TEMPLATE_QUICK_REPLY]:
      'Template Quick Reply (Custom) — Meta type "button", not interactive',
    [INCOMING_REPLY_CATEGORIES.INTERACTIVE_BUTTON_REPLY]:
      'Interactive Button Reply — Meta interactive.type "button_reply"',
    [INCOMING_REPLY_CATEGORIES.INTERACTIVE_LIST_REPLY]:
      'Interactive List Reply — Meta interactive.type "list_reply"',
  };

  console.log(
    `[WhatsApp Reply] ${labels[reply.category] || reply.category} | from=${from} | id=${reply.id} | title=${reply.title}`,
  );
}
