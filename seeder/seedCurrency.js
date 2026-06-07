import { Currency } from '../models/index.js';

async function seedCurrency() {
  try {
    const egpCurrency = {
      name: 'Egyptian Pound',
      code: 'EGP',
      symbol: 'E£',
      exchange_rate: 1,
      decimal_number: 2,
      sort_order: 1,
      is_active: true,
      is_default: true,
    };

    await Currency.findOneAndUpdate(
      { code: egpCurrency.code },
      egpCurrency,
      { upsert: true, returnDocument: 'after' }
    );

    await Currency.updateMany(
      { code: { $ne: 'EGP' }, deleted_at: null },
      { $set: { deleted_at: new Date(), is_active: false, is_default: false } }
    );

    console.log('Currencies seeded successfully!');
  } catch (error) {
    console.error('Error seeding currencies:', error);
    throw error;
  }
}

export default seedCurrency;
