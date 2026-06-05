/**
 * Meta WhatsApp Business Messaging — inbound reply categories.
 *
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/reference/messages/button
 *   Template quick-reply (Custom): message.type === "button"
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-reply-buttons-messages
 *   Interactive reply buttons: message.type === "interactive", interactive.type === "button_reply"
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/reference/messages/interactive
 *   List replies: message.type === "interactive", interactive.type === "list_reply"
 */
export const INCOMING_REPLY_CATEGORIES = {
  /** Template message quick-reply button (Meta webhook type: "button") */
  TEMPLATE_QUICK_REPLY: 'template_quick_reply',
  /** Bot-flow / API interactive reply button (interactive.type: "button_reply") */
  INTERACTIVE_BUTTON_REPLY: 'interactive_button_reply',
  /** Interactive list menu selection (interactive.type: "list_reply") */
  INTERACTIVE_LIST_REPLY: 'interactive_list_reply',
};

/** Legacy file_type value kept for interactive button replies in stored messages */
export const LEGACY_FILE_TYPE_INTERACTIVE_BUTTON = 'button_reply';

/** file_type stored on Message documents per category */
export const REPLY_FILE_TYPES = {
  [INCOMING_REPLY_CATEGORIES.TEMPLATE_QUICK_REPLY]: 'template_quick_reply',
  [INCOMING_REPLY_CATEGORIES.INTERACTIVE_BUTTON_REPLY]: LEGACY_FILE_TYPE_INTERACTIVE_BUTTON,
  [INCOMING_REPLY_CATEGORIES.INTERACTIVE_LIST_REPLY]: 'list_reply',
};
