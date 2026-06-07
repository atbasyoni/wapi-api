import EcommerceOrder from '../models/ecommerce-order.model.js';
import EcommerceOrderCustomerResponse from '../models/ecommerce-order-customer-response.model.js';
import {
  ORDER_CONFIRMATION_STATUSES,
  DELIVERY_METHOD_SELECTIONS
} from '../models/ecommerce-order-customer-response.model.js';

const RESPONSE_FIELDS = [
  'confirmation_status',
  'delivery_address',
  'latitude',
  'longitude',
  'delivery_address_details',
  'delivery_method_selection',
  'another_person_number'
];

const isNonEmpty = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
};

const parseCoordinate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

export const normalizeReplyText = (value) => {
  if (!isNonEmpty(value)) return null;

  let text = String(value).trim();
  if (text.includes('___')) {
    text = text.split('___').pop() || text;
  }

  return text.trim();
};

const matchEnumValue = (value, allowedValues = []) => {
  const normalized = normalizeReplyText(value);
  if (!normalized) return null;

  if (allowedValues.includes(normalized)) {
    return normalized;
  }

  for (const option of allowedValues) {
    if (normalized.includes(option) || option.includes(normalized)) {
      return option;
    }
  }

  return null;
};

const validateEnumField = (field, value) => {
  if (!isNonEmpty(value)) return null;

  if (field === 'confirmation_status') {
    const matched = matchEnumValue(value, ORDER_CONFIRMATION_STATUSES);
    if (!matched) {
      console.warn(`[OrderCustomerResponse] Invalid confirmation_status: "${value}"`);
    }
    return matched;
  }

  if (field === 'delivery_method_selection') {
    const matched = matchEnumValue(value, DELIVERY_METHOD_SELECTIONS);
    if (!matched) {
      console.warn(`[OrderCustomerResponse] Invalid delivery_method_selection: "${value}"`);
    }
    return matched;
  }

  return String(value).trim();
};

const buildFieldUpdates = (fields = {}) => {
  const updates = {};

  for (const field of RESPONSE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(fields, field)) continue;

    const raw = fields[field];

    if (field === 'latitude' || field === 'longitude') {
      const parsed = parseCoordinate(raw);
      if (parsed !== null) updates[field] = parsed;
      continue;
    }

    if (field === 'confirmation_status' || field === 'delivery_method_selection') {
      const validated = validateEnumField(field, raw);
      if (validated !== null) updates[field] = validated;
      continue;
    }

    if (isNonEmpty(raw)) {
      updates[field] = String(raw).trim();
    }
  }

  return updates;
};

const resolveOrder = async ({ userId, orderId, waOrderId, contactId }) => {
  if (orderId) {
    const order = await EcommerceOrder.findOne({
      _id: orderId,
      user_id: userId,
      deleted_at: null
    }).lean();

    if (order) return order;
  }

  if (waOrderId) {
    const order = await EcommerceOrder.findOne({
      user_id: userId,
      wa_order_id: waOrderId,
      deleted_at: null
    })
      .sort({ created_at: -1 })
      .lean();

    if (order) return order;
  }

  if (contactId) {
    return await EcommerceOrder.findOne({
      user_id: userId,
      contact_id: contactId,
      deleted_at: null
    })
      .sort({ created_at: -1 })
      .lean();
  }

  return null;
};

const extractFieldsFromInboundMessage = ({ message, incomingReply, content }) => {
  const fields = {};
  const replyCandidates = [
    incomingReply?.title,
    incomingReply?.id,
    incomingReply?.payload,
    content
  ].filter(isNonEmpty);

  for (const candidate of replyCandidates) {
    const confirmationStatus = matchEnumValue(candidate, ORDER_CONFIRMATION_STATUSES);
    if (confirmationStatus) {
      fields.confirmation_status = confirmationStatus;
      break;
    }
  }

  for (const candidate of replyCandidates) {
    const deliveryMethod = matchEnumValue(candidate, DELIVERY_METHOD_SELECTIONS);
    if (deliveryMethod) {
      fields.delivery_method_selection = deliveryMethod;
      break;
    }
  }

  if (message?.type === 'location' && message.location) {
    const { latitude, longitude, address, name } = message.location;
    if (Number.isFinite(Number(latitude))) fields.latitude = Number(latitude);
    if (Number.isFinite(Number(longitude))) fields.longitude = Number(longitude);

    const addressText = [address, name].filter(isNonEmpty).join(' - ');
    if (addressText) fields.delivery_address = addressText;
  }

  if (message?.type === 'text' && message.text?.body) {
    const text = message.text.body.trim();
    const phoneLike = text.replace(/[^\d+]/g, '');

    if (phoneLike.length >= 8 && /^\+?\d{8,15}$/.test(phoneLike)) {
      fields.another_person_number = text;
    } else if (!fields.confirmation_status && !fields.delivery_method_selection) {
      fields.delivery_address_details = text;
    }
  }

  return fields;
};

export const processInboundCustomerReply = async ({
  userId,
  contactId,
  message,
  incomingReply,
  content,
  waMessageId,
  pendingOrderId,
  pendingWaOrderId
}) => {
  const fields = extractFieldsFromInboundMessage({ message, incomingReply, content });

  if (Object.keys(fields).length === 0) {
    return null;
  }

  const order = await resolveOrder({
    userId,
    orderId: pendingOrderId,
    waOrderId: pendingWaOrderId,
    contactId
  });

  if (!order) {
    console.warn('[OrderCustomerResponse] No order found for inbound customer reply');
    return null;
  }

  const doc = await upsertOrderCustomerResponse({
    userId,
    orderId: order._id,
    waOrderId: order.wa_order_id,
    contactId,
    fields,
    waMessageId
  });

  console.log(`[OrderCustomerResponse] Saved inbound reply for order ${order._id}`);
  return doc;
};

export const upsertOrderCustomerResponse = async ({
  userId,
  orderId,
  waOrderId,
  contactId,
  fields = {},
  waMessageId
}) => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  const order = await resolveOrder({ userId, orderId, waOrderId, contactId });

  if (!order) {
    throw new Error('Order not found');
  }

  const fieldUpdates = buildFieldUpdates(fields);

  if (Object.keys(fieldUpdates).length === 0 && !waMessageId) {
    const existing = await EcommerceOrderCustomerResponse.findOne({
      order_id: order._id,
      user_id: userId,
      deleted_at: null
    }).lean();

    return existing;
  }

  const setPayload = {
    ...fieldUpdates,
    order_id: order._id,
    wa_order_id: order.wa_order_id || waOrderId || null,
    user_id: userId,
    contact_id: contactId || order.contact_id
  };

  if (waMessageId) {
    setPayload.wa_message_id = waMessageId;
  }

  const doc = await EcommerceOrderCustomerResponse.findOneAndUpdate(
    { order_id: order._id, user_id: userId, deleted_at: null },
    { $set: setPayload },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  ).lean();

  return doc;
};

export const getByOrderId = async (userId, orderId) => {
  return await EcommerceOrderCustomerResponse.findOne({
    order_id: orderId,
    user_id: userId,
    deleted_at: null
  }).lean();
};

export const getByWaOrderId = async (userId, waOrderId) => {
  return await EcommerceOrderCustomerResponse.findOne({
    user_id: userId,
    wa_order_id: waOrderId,
    deleted_at: null
  }).lean();
};

export const attachToOrders = async (orders = []) => {
  if (!Array.isArray(orders) || orders.length === 0) return orders;

  const orderIds = orders.map((o) => o._id).filter(Boolean);

  const responses = await EcommerceOrderCustomerResponse.find({
    order_id: { $in: orderIds },
    deleted_at: null
  }).lean();

  const responseMap = {};
  for (const r of responses) {
    responseMap[String(r.order_id)] = r;
  }

  return orders.map((order) => ({
    ...order,
    customer_response: responseMap[String(order._id)] || null
  }));
};

export const formatCustomerResponse = (doc) => {
  if (!doc) return null;

  return {
    confirmation_status: doc.confirmation_status || null,
    delivery_address: doc.delivery_address || null,
    latitude: doc.latitude ?? null,
    longitude: doc.longitude ?? null,
    delivery_address_details: doc.delivery_address_details || null,
    delivery_method_selection: doc.delivery_method_selection || null,
    another_person_number: doc.another_person_number || null,
    updated_at: doc.updated_at
  };
};

export default {
  upsertOrderCustomerResponse,
  processInboundCustomerReply,
  getByOrderId,
  getByWaOrderId,
  attachToOrders,
  formatCustomerResponse,
  normalizeReplyText
};
