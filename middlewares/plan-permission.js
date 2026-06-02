import mongoose from 'mongoose';
import { Subscription, Setting, User } from '../models/index.js';

function getUserId(user) {
  if (!user) return null;
  const id = user._id ?? user.id;
  if (!id) return null;
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

export const requireSubscription = async (req, res, next) => {
  req.subscription = req.subscription || null;
  req.plan = req.plan || null;
  return next();
};

export const requirePlanFeature = () => {
  return (req, res, next) => next();
};

export const checkPlanLimit = () => {
  return (req, res, next) => next();
};

export const attachSubscriptionIfAny = async (req, res, next) => {
  const userId = getUserId(req.user);
  if (!userId) return next();

  const subscription = await Subscription.findOne({
    user_id: userId,
    deleted_at: null,
    status: { $in: ['active', 'trial'] },
    current_period_end: { $gte: new Date() },
  })
    .populate('plan_id')
    .lean();

  req.subscription = subscription || null;
  req.plan = subscription?.plan_id || null;

  if (!subscription && req.user?.role !== 'super_admin') {
    const adminSettings = await Setting.findOne().select('free_trial_enabled free_trial_days').lean();
    if (adminSettings?.free_trial_enabled && adminSettings?.free_trial_days > 0) {
      const user = await User.findById(userId).select('created_at').lean();
      if (user?.created_at) {
        const daysSinceRegistration = Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceRegistration <= adminSettings.free_trial_days) {
          req.isFreeTrial = true;
          req.freeTrialDaysRemaining = Math.max(0, adminSettings.free_trial_days - daysSinceRegistration);
        }
      }
    }
  }

  return next();
};
