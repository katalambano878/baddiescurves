/**
 * Used to ask visitors to "enable notifications" for orders and deals. It could
 * never deliver one: the push key was the placeholder 'YOUR_VAPID_PUBLIC_KEY_HERE',
 * the icon file did not exist and nothing on the server sends pushes. The prompt
 * has been removed. The store layout still mounts this component; it renders
 * nothing until push is really set up (a VAPID key pair, a place to store
 * subscriptions and a sender).
 */
export default function PushNotificationManager() {
  return null;
}
