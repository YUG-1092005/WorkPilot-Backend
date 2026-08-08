//const { getMessaging } = require('firebase-admin/messaging');
//const PushDevice = require('../models/PushDevice');
//const { getFirebaseApp } = require('../config/firebaseAdmin');
//
//const invalidTokenCodes = new Set([
//  'messaging/invalid-registration-token',
//  'messaging/registration-token-not-registered',
//]);
//
//const routeForType = (type) => {
//  if (`${type}`.startsWith('inventory_')) return '/inventory';
//  if (`${type}`.startsWith('task_')) return '/tasks';
//  if (`${type}`.startsWith('payment_')) return '/payments';
//  if (`${type}`.startsWith('expense_')) return '/expenses';
//  return '/notifications';
//};
//
//const sendPushForNotification = async (notification) => {
//  const firebaseApp = getFirebaseApp();
//  if (!firebaseApp || !notification?.ownerId) return { sent: 0, failed: 0 };
//
//  const devices = await PushDevice.find({
//    ownerId: notification.ownerId,
//    businessId: notification.businessId,
//    isActive: true,
//  }).select('_id token');
//
//  const tokens = [...new Set(devices.map((device) => device.token).filter(Boolean))];
//  if (tokens.length === 0) return { sent: 0, failed: 0 };
//
//  let sent = 0;
//  let failed = 0;
//  const staleTokens = [];
//
//  for (let start = 0; start < tokens.length; start += 500) {
//    const batch = tokens.slice(start, start + 500);
//    const response = await getMessaging(firebaseApp).sendEachForMulticast({
//      tokens: batch,
//      notification: {
//        title: `${notification.title || 'WorkPilot'}`,
//        body: `${notification.message || 'You have a new business update.'}`,
//      },
//      data: {
//        notificationId: `${notification._id || ''}`,
//        type: `${notification.type || 'system'}`,
//        severity: `${notification.severity || 'info'}`,
//        route: routeForType(notification.type),
//      },
//      android: {
//        priority: 'high',
//        notification: {
//          channelId: 'workpilot_alerts',
//          sound: 'default',
//          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
//        },
//      },
//    });
//
//    sent += response.successCount;
//    failed += response.failureCount;
//    response.responses.forEach((item, index) => {
//      if (!item.success && invalidTokenCodes.has(item.error?.code)) {
//        staleTokens.push(batch[index]);
//      }
//    });
//  }
//
//  if (staleTokens.length > 0) {
//    await PushDevice.deleteMany({ token: { $in: staleTokens } });
//  }
//  return { sent, failed };
//};
//
//module.exports = { routeForType, sendPushForNotification };

const { getMessaging } = require('firebase-admin/messaging');
const PushDevice = require('../models/PushDevice');
const { getFirebaseApp } = require('../config/firebaseAdmin');

const invalidTokenCodes = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

const routeForType = (type) => {
  if (`${type}`.startsWith('inventory_')) return '/inventory';
  if (`${type}`.startsWith('task_')) return '/tasks';
  if (`${type}`.startsWith('payment_')) return '/payments';
  if (`${type}`.startsWith('expense_')) return '/expenses';
  return '/notifications';
};

const sendPushForNotification = async (notification) => {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp || !notification?.ownerId) return { sent: 0, failed: 0 };

  const devices = await PushDevice.find({
    ownerId: notification.ownerId,
    businessId: notification.businessId,
    isActive: true,
  }).select('_id token');

  const tokens = [...new Set(devices.map((device) => device.token).filter(Boolean))];
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const staleTokens = [];

  for (let start = 0; start < tokens.length; start += 500) {
    const batch = tokens.slice(start, start + 500);
    const response = await getMessaging(firebaseApp).sendEachForMulticast({
      tokens: batch,
      notification: {
        title: `${notification.title || 'WorkPilot'}`,
        body: `${notification.message || 'You have a new business update.'}`,
      },
      data: {
        notificationId: `${notification._id || ''}`,
        type: `${notification.type || 'system'}`,
        severity: `${notification.severity || 'info'}`,
        route: routeForType(notification.type),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'workpilot_alerts',
          sound: 'default',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
    });

    sent += response.successCount;
    failed += response.failureCount;
    response.responses.forEach((item, index) => {
      if (!item.success && invalidTokenCodes.has(item.error?.code)) {
        staleTokens.push(batch[index]);
      }
    });
  }

  if (staleTokens.length > 0) {
    await PushDevice.deleteMany({ token: { $in: staleTokens } });
  }
  return { sent, failed };
};

module.exports = { routeForType, sendPushForNotification };
