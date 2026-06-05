import { Message } from '../../models/index.js';

/**
 * Normalize phone numbers so +1234 and 1234 are treated as the same contact.
 */
export const normalizePhoneNumber = (phone) => {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '').replace(/^0+/, '');
};

/** Build common phone formats stored in messages (with/without +, spaces). */
export const buildPhoneVariants = (phone) => {
  const variants = new Set();
  if (!phone) return [];

  const raw = String(phone).trim();
  const digits = normalizePhoneNumber(raw);

  if (raw) variants.add(raw);
  if (digits) {
    variants.add(digits);
    variants.add(`+${digits}`);
    variants.add(`00${digits}`);
  }

  return [...variants].filter(Boolean);
};

/**
 * Build the recent-chats list with a single aggregation instead of N+1 queries.
 * Groups by contact number and keeps only the latest message per conversation.
 */
export const getRecentChatsFromMessages = async (myPhoneNumber) => {
  const phoneVariants = buildPhoneVariants(myPhoneNumber);

  const results = await Message.aggregate([
    {
      $match: {
        deleted_at: null,
        $or: [
          { sender_number: { $in: phoneVariants } },
          { recipient_number: { $in: phoneVariants } }
        ]
      }
    },
    {
      $addFields: {
        contactNumber: {
          $cond: [
            { $in: ['$sender_number', phoneVariants] },
            '$recipient_number',
            '$sender_number'
          ]
        }
      }
    },
    {
      $match: {
        contactNumber: { $ne: null, $nin: [...phoneVariants, ''] }
      }
    },
    { $sort: { wa_timestamp: -1 } },
    {
      $group: {
        _id: '$contactNumber',
        lastMessage: { $first: '$$ROOT' }
      }
    },
    { $sort: { 'lastMessage.wa_timestamp': -1 } }
  ]);

  return results.map(({ _id: contactNumber, lastMessage }) => ({
    contact: {
      number: contactNumber,
      name: contactNumber,
      avatar: null
    },
    lastMessage: {
      id: lastMessage._id.toString(),
      content: lastMessage.content,
      messageType: lastMessage.message_type,
      fileUrl: lastMessage.file_url,
      direction: lastMessage.direction,
      fromMe: lastMessage.from_me,
      createdAt: lastMessage.wa_timestamp,
      is_seen: lastMessage.is_seen || false,
      read_status: lastMessage.read_status || 'unread'
    }
  }));
};

/**
 * Merge conversations that share the same normalized phone number.
 * Keeps the entry with the most recent last message.
 */
export const deduplicateChatsByPhone = (chats) => {
  const seen = new Map();

  for (const chat of chats) {
    const normalized = normalizePhoneNumber(chat.contact?.number);
    if (!normalized) continue;

    const existing = seen.get(normalized);
    if (!existing) {
      seen.set(normalized, chat);
      continue;
    }

    const existingDate = new Date(existing.lastMessage?.createdAt || 0).getTime();
    const newDate = new Date(chat.lastMessage?.createdAt || 0).getTime();
    if (newDate >= existingDate) {
      seen.set(normalized, chat);
    }
  }

  return Array.from(seen.values());
};

/**
 * WhatsApp-style ordering: pinned chats first, then by most recent message.
 */
export const sortChatsByRecentActivity = (chats) => {
  return [...chats].sort((a, b) => {
    const aPinned = a.is_pinned === true;
    const bPinned = b.is_pinned === true;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;

    const dateA = new Date(a.lastMessage?.createdAt || 0).getTime();
    const dateB = new Date(b.lastMessage?.createdAt || 0).getTime();
    return dateB - dateA;
  });
};
