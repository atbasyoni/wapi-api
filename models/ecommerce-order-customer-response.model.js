import mongoose from 'mongoose';

export const ORDER_CONFIRMATION_STATUSES = [
  'تأكيد الاوردر',
  'تأجيل التسليم',
  'إلغاء الاوردر'
];

export const DELIVERY_METHOD_SELECTIONS = [
  'اتصل قبل الوصول',
  'التوصيل للعنوان بدون اتصال',
  'اتصل بشخص آخر'
];

const ecommerceOrderCustomerResponseSchema = new mongoose.Schema({
  order_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EcommerceOrder',
    required: true,
    unique: true,
    index: true
  },

  wa_order_id: {
    type: String,
    default: null,
    index: true
  },

  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  contact_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    required: true
  },

  confirmation_status: {
    type: String,
    enum: ORDER_CONFIRMATION_STATUSES
  },

  delivery_address: {
    type: String,
    default: null
  },

  latitude: {
    type: Number,
    default: null
  },

  longitude: {
    type: Number,
    default: null
  },

  delivery_address_details: {
    type: String,
    default: null
  },

  delivery_method_selection: {
    type: String,
    enum: DELIVERY_METHOD_SELECTIONS
  },

  another_person_number: {
    type: String,
    default: null
  },

  wa_message_id: {
    type: String,
    default: null
  },

  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'ecommerce_order_customer_responses'
});

ecommerceOrderCustomerResponseSchema.index({ user_id: 1, wa_order_id: 1 });

export default mongoose.model('EcommerceOrderCustomerResponse', ecommerceOrderCustomerResponseSchema);
